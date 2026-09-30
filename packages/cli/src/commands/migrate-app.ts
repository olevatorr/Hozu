import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import {
  addImport,
  apply,
  callOf,
  type Edit,
  importItems,
  importsFrom,
  importText,
  keyName,
  lineOf,
  localOf,
  type Node,
  type Note,
  parse,
  property,
  walk,
} from './migrate-ast.ts'
import { insertProperty } from './migrate-head.ts'

export interface AppRewrite {
  entry: string | null
  write: Map<string, string>
  remove: string[]
  notes: Note[]
}

const DERIVED = new Set([
  'build',
  'styles',
  'images',
  'env',
  'readFile',
  'publicDir',
  'manifest',
  'render',
  'port',
])
const RESOLVERS = 'createResolvers'

const rel = (dir: string, file: string) => {
  const r = relative(dir, file)
  return r.startsWith('.') ? r : `./${r}`
}

function freeNames(n: Node): Set<string> {
  const out = new Set<string>()
  walk(n, (x, p) => {
    if (x.type !== 'Identifier') return
    if (p?.type === 'MemberExpression' && p.property === x && !p.computed) return
    if (p?.type === 'Property' && p.key === x && !p.computed && !p.shorthand) return
    out.add(x.name)
  })
  return out
}

function topLevel(program: Node): Map<string, Node> {
  const out = new Map<string, Node>()
  for (const s of program.body) {
    const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s
    if (d?.type === 'VariableDeclaration')
      for (const v of d.declarations) walk(v.id, (x) => x.type === 'Identifier' && out.set(x.name, s))
    else if ((d?.type === 'FunctionDeclaration' || d?.type === 'ClassDeclaration') && d.id)
      out.set(d.id.name, s)
    else if (s.type === 'ImportDeclaration') for (const x of s.specifiers) out.set(x.local.name, s)
  }
  return out
}

const resolversCall = (n: Node | undefined) => callOf(n, null, RESOLVERS) && n!.arguments.length === 0

/** The object literal that holds `resolvers: createResolvers()`. */
function optionsOf(program: Node): Node | null {
  let found: Node | null = null
  walk(program, (n) => {
    if (!found && n.type === 'ObjectExpression' && resolversCall(property(n, 'resolvers')?.value)) found = n
  })
  return found
}

function entryOf(dir: string, pkg: Record<string, any>): string | null {
  for (const key of ['start', 'serve', 'dev']) {
    const script = pkg.scripts?.[key]
    const file = typeof script === 'string' ? /([\w./-]+\.ts)\b/.exec(script)?.[1] : null
    if (file && existsSync(join(dir, file))) return join(dir, file)
  }
  return null
}

/** `serve.ts` + `createResolvers()` → the app module and `project({ app })` (ADR 0043 E). */
export function migrateApp(dir: string, config: string, files: Map<string, string>): AppRewrite {
  const out: AppRewrite = { entry: null, write: new Map(), remove: [], notes: [] }
  const note = (file: string, line: number, message: string, see = 'deploy', behaviour = false) =>
    out.notes.push({ file, line, rule: 'app', message, see, behaviour })
  const users = [...files].filter(([, s]) => /\bcreateResolvers\b/.test(s))
  if (!users.length) return out
  const pkgPath = join(dir, 'package.json')
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {}
  const entry = entryOf(dir, pkg)
  out.entry = entry
  let defining: { file: string; program: Node; stmt: Node; fn: Node } | null = null
  for (const [file, source] of users) {
    const program = parse(source)
    for (const s of program.body) {
      const d = s.type === 'ExportNamedDeclaration' ? s.declaration : null
      if (d?.type === 'FunctionDeclaration' && d.id?.name === RESOLVERS)
        defining = { file, program, stmt: s, fn: d }
      if (d?.type === 'VariableDeclaration')
        for (const v of d.declarations)
          if (v.id.name === RESOLVERS && v.init && /Function/.test(v.init.type))
            defining = { file, program, stmt: s, fn: v.init }
    }
  }
  if (!defining) return out
  const target = join(dirname(defining.file), 'app.ts')
  const appSource = files.get(target) ?? (existsSync(target) ? readFileSync(target, 'utf8') : null)
  if (appSource !== null && appSource !== undefined) {
    note(
      target,
      1,
      `${rel(dir, target)} exists: move createResolvers() into it by hand (export default app({ resolvers }))`,
    )
    return out
  }
  if (defining.fn.params.length) {
    note(
      defining.file,
      lineOf(files.get(defining.file)!, defining.fn.start),
      'createResolvers() takes parameters: make the app module by hand (export default app({ resolvers }))',
    )
    return out
  }
  const source = files.get(defining.file)!
  const body = defining.fn.body
  const statements =
    body.type === 'BlockStatement' ? body.body : [{ type: 'ReturnStatement', argument: body }]
  const ret = statements[statements.length - 1]
  if (ret?.type !== 'ReturnStatement' || !ret.argument) {
    note(
      defining.file,
      lineOf(source, defining.fn.start),
      'createResolvers() does not end in a return: make the app module by hand',
    )
    return out
  }
  const setup = statements
    .slice(0, -1)
    .map((s: Node) => source.slice(s.start, s.end).replace(/\n {2}/g, '\n'))
  const resolversText = source.slice(ret.argument.start, ret.argument.end).replace(/\n {2}/g, '\n')

  const serves = (f: string) => {
    const t = files.get(f)
    return !!t && /from '@hozu\/adapter-node'/.test(t) && optionsOf(parse(t)) !== null
  }
  const hostFile =
    entry && files.get(entry) && optionsOf(parse(files.get(entry)!))
      ? entry
      : (users.find(([f]) => f !== defining!.file && serves(f))?.[0] ?? null)
  if (!out.entry && hostFile) out.entry = hostFile
  const host = hostFile
    ? hostFile
    : (users.find(([f, s]) => f !== defining!.file && optionsOf(parse(s)))?.[0] ?? null)
  const carried: string[] = []
  const named = new Map<string, string[]>()
  const defaults: string[] = []
  const options: string[] = [`  resolvers: ${resolversText.replace(/\n/g, '\n  ')},`]
  const appImports = source.slice(0, defining.stmt.start)
  let wrapper = false
  if (host) {
    const hs = files.get(host)!
    const hp = parse(hs)
    const obj = optionsOf(hp)!
    const decls = topLevel(hp)
    const need = new Set<string>()
    for (const p of obj.properties) {
      const k = keyName(p)
      if (!k || k === 'resolvers' || DERIVED.has(k)) continue
      if (k === 'widgets') {
        options.push('  widgets: bundleWidgets,')
        need.add('bundleWidgets')
        continue
      }
      const cookie = importsFrom(hp, '@hozu/runtime-server').get('sessionCookie') ?? ''
      const stateless = (v: Node) =>
        callOf(v, null, cookie) ||
        (v.type === 'Identifier' &&
          decls.get(v.name)?.type === 'VariableDeclaration' &&
          decls
            .get(v.name)!
            .declarations.some((d: Node) => d.id.name === v.name && callOf(d.init, null, cookie)))
      if (k === 'session' && stateless(p.value)) {
        note(
          host,
          lineOf(hs, p.start),
          'sessionCookie(...) dropped: sessions are a server-side store (memorySessions) by default; set SESSION_SECRET in production, and everyone signs in once more after the upgrade',
          'deploy',
          true,
        )
        continue
      }
      options.push(`  ${hs.slice(p.start, p.end).replace(/\n/g, '\n  ')},`)
      for (const n of freeNames(p.value)) need.add(n)
    }
    const seen = new Set<Node>()
    const visit = (name: string) => {
      const s = decls.get(name)
      if (!s || seen.has(s)) return
      seen.add(s)
      if (s.type === 'ImportDeclaration') {
        const x = s.specifiers.find((y: Node) => y.local.name === name)
        const from = String(s.source.value).startsWith('.')
          ? rel(dirname(target), resolve(dirname(host), s.source.value))
          : s.source.value
        if (x.type === 'ImportSpecifier')
          named.set(from, [...(named.get(from) ?? []), hs.slice(x.start, x.end)])
        else defaults.push(`import ${hs.slice(x.start, x.end)} from '${from}'`)
        return
      }
      for (const n of freeNames(s)) if (n !== name) visit(n)
      carried.push(hs.slice(s.start, s.end))
    }
    for (const n of need) visit(n)
    if (host === hostFile) {
      const known = (s: Node) => {
        if (s.type === 'ImportDeclaration' || seen.has(s)) return true
        const text = hs.slice(s.start, s.end)
        if (/^const (port|build|widgets)\b/.test(text)) return true
        if (/^for \(const \w+ of widgets\.diagnostics\)/.test(text)) return true
        let holds = false
        walk(s, (x) => {
          if (x === obj) holds = true
        })
        return holds && /\.listen\(/.test(text) && !/writeHead|setHeader|\.on\(|res\.|req\./.test(text)
      }
      const unknown = hp.body.filter((s: Node) => !known(s))
      for (const s of unknown) {
        wrapper = true
        note(
          host,
          lineOf(hs, s.start),
          `${basename(host)} wraps the server: ${hs.slice(s.start, s.end).split('\n')[0]!.slice(0, 80)} — there is no wrapper position in 0.8: headers go through project({ http }), statuses through head.failed / endpoint failed, lang through site.locales`,
          'deploy',
          true,
        )
      }
      if (!wrapper) out.remove.push(host)
      else
        note(
          host,
          1,
          `${basename(host)} is kept for you to move by hand; npm start now runs hozu serve`,
          'deploy',
          true,
        )
    }
  }
  const edits: Edit[] = []
  const header = parse(appImports)
  if (options.some((o) => o.startsWith('  widgets: bundleWidgets')))
    named.set('@hozu/bundle', ['bundleWidgets'])
  named.set('@hozu/runtime-server', [...(named.get('@hozu/runtime-server') ?? []), 'app'])
  const added: string[] = []
  for (const [from, names] of [...named].sort(([a], [b]) => a.localeCompare(b))) {
    const held = header.body.some((x: Node) => x.type === 'ImportDeclaration' && x.source.value === from)
    const e = held ? addImport(appImports, header, from, names) : null
    if (e) edits.push(e)
    else if (!held) added.push(importText(names, from))
  }
  const imports = [apply(appImports, edits).trimEnd(), ...added, ...defaults].join('\n')
  const tail = source.slice(defining.stmt.end).trim()
  const code = `${[imports, '', ...carried, ...setup].join('\n').replace(/\n{3,}/g, '\n\n')}\n\nexport default app({\n${options.join('\n')}\n})${tail ? `\n\n${tail}` : ''}\n`
  out.write.set(target, code)
  out.remove.push(defining.file)
  note(
    target,
    1,
    `${rel(dir, defining.file)} and ${host ? rel(dir, host) : 'createResolvers()'} → ${rel(dir, target)} (export default app({ resolvers${options.length > 1 ? ', …' : ''} }))`,
  )
  for (const [file, s] of users) {
    if (file === defining.file || (file === host && out.remove.includes(host))) continue
    const program = parse(s)
    const imp = program.body.find(
      (x: Node) =>
        x.type === 'ImportDeclaration' && x.specifiers.some((y: Node) => y.local.name === RESOLVERS),
    )
    if (!imp) continue
    const e: Edit[] = []
    const taken = new Set<string>()
    walk(program, (n) => n.type === 'Identifier' && taken.add(n.name))
    const local = taken.has('app') ? 'hozuApp' : 'app'
    const kept = importItems(s, imp).filter((x) => localOf(x) !== RESOLVERS)
    const appImport = `import ${local} from '${rel(dirname(file), target)}'`
    e.push([
      imp.start,
      imp.end,
      kept.length ? `${appImport}\n${importText(kept, imp.source.value)}` : appImport,
    ])
    walk(program, (n) => {
      if (resolversCall(n)) e.push([n.start, n.end, `appOptionsOf(${local})!.resolvers`])
    })
    const aux = addImport(s, program, '@hozu/runtime-server', ['appOptionsOf'])
    if (aux) e.push(aux)
    out.write.set(file, apply(s, e))
    note(
      file,
      lineOf(s, imp.start),
      'createResolvers() → appOptionsOf(app)!.resolvers from the app module',
      'testing',
    )
  }
  const cfg = files.get(config)
  if (cfg && !/\bapp\s*:\s*new URL\(/.test(cfg)) {
    const program = parse(cfg)
    let call: Node | null = null
    walk(program, (n) => {
      if (!call && callOf(n, null, importsFrom(program, '@hozu/core').get('project') ?? 'project')) call = n
    })
    const opts = (call as Node | null)?.arguments[0]
    if (opts?.type === 'ObjectExpression')
      out.write.set(
        config,
        apply(cfg, [
          insertProperty(cfg, opts, `app: new URL('${rel(dirname(config), target)}', import.meta.url)`),
        ]),
      )
    else note(config, 1, "add app: new URL('./app.ts', import.meta.url) to project({ … })")
  }
  return out
}

/** `scripts.start` → `hozu serve`, entry scripts → `hozu serve` / `hozu-dev`, plus `@hozu/runtime-server`. */
export function migratePackage(source: string, entry: string | null): { code: string; notes: Note[] } {
  const pkg = JSON.parse(source)
  const notes: Note[] = []
  const file = 'package.json'
  const scripts: Record<string, string> = pkg.scripts ?? {}
  const name = entry ? basename(entry).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null
  for (const [k, v] of Object.entries(scripts)) {
    if (!name) break
    const next = v
      .replace(new RegExp(`^node (--import @hozu/transform/register )?(\\./)?${name}$`), 'hozu serve')
      .replace(new RegExp(`^hozu-dev (\\./)?${name}$`), 'hozu-dev')
    if (next !== v) {
      scripts[k] = next
      notes.push({ file, line: 1, rule: 'package', message: `scripts.${k}: ${v} → ${next}`, see: 'deploy' })
    }
  }
  if (scripts.start !== 'hozu serve') {
    notes.push({
      file,
      line: 1,
      rule: 'package',
      message: `scripts.start: ${scripts.start ?? '(none)'} → hozu serve`,
      see: 'deploy',
    })
    scripts.start = 'hozu serve'
  }
  pkg.scripts = scripts
  const deps: Record<string, string> = pkg.dependencies ?? {}
  if (!deps['@hozu/runtime-server'] && deps['@hozu/core']) {
    deps['@hozu/runtime-server'] = deps['@hozu/core'].replace('hozu-core-', 'hozu-runtime-server-')
    pkg.dependencies = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)))
    notes.push({
      file,
      line: 1,
      rule: 'package',
      message: 'dependencies: + @hozu/runtime-server (app())',
      see: 'deploy',
    })
  }
  const indent = /^\{\n(\s+)"/.exec(source)?.[1] ?? '  '
  const code = `${JSON.stringify(pkg, null, indent)}\n`
  return { code: code === source ? source : code, notes }
}
