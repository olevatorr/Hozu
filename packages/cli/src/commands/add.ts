import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import type { AddOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import {
  accountFeature,
  accountModel,
  accountServer,
  accountViews,
  featureFile,
  model,
  namesOf,
  PARTS,
  type Part,
  server,
  views,
  type With,
} from './scaffold.ts'

export const addImport = (source: string, line: string): string | null => {
  const imports = [...source.matchAll(/^import[\s\S]*?from '[^']+'\n/gm)]
  const last = imports.at(-1)
  if (!last) return null
  const at = last.index + last[0].length
  return source.slice(0, at) + line + source.slice(at)
}

const callEnd = (source: string, open: number): number => {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < source.length; i++) {
    const c = source[i]!
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
    } else if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i + 1
  }
  return -1
}

const replacePage = (source: string, route: string, text: string): string | null => {
  const m = new RegExp(`ui\\.page\\(\\s*${route}\\s*,`).exec(source)
  if (!m) return null
  const end = callEnd(source, m.index + 'ui.page'.length)
  return end < 0 ? null : source.slice(0, m.index) + text + source.slice(end)
}

const append = (source: string, pattern: RegExp, item: string): string | null => {
  const m = pattern.exec(source)
  if (!m) return null
  const inner = m[1]!.trim().replace(/,$/, '')
  const replaced = m[0].replace(m[1]!, inner ? `${inner}, ${item}` : item)
  return source.slice(0, m.index) + replaced + source.slice(m.index + m[0].length)
}

export async function runAddFeature(
  cwd: string,
  config: string | undefined,
  name: string | undefined,
  page: string | undefined,
  parts: string | undefined = undefined,
): Promise<AddOutput> {
  const asked = (parts ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  for (const p of asked)
    if (!PARTS.includes(p as Part))
      throw new HozuCliError('usage', `Unknown --with part "${p}"`, [`--with ${PARTS.join(',')}`])
  const w: With = Object.fromEntries(PARTS.map((p) => [p, asked.includes(p)])) as With
  if (w.filter) w.toggle = true
  if (w.detail && page === undefined)
    throw new HozuCliError('usage', '--with detail needs --page, so the detail page can link back', [
      `hozu add feature ${name ?? 'tasks'} --page / --with detail`,
    ])
  if (w.auth && page === undefined)
    throw new HozuCliError('usage', '--with auth needs --page, the page that signed-in users land on', [
      `hozu add feature ${name ?? 'notes'} --page / --with auth`,
    ])
  if (!name || !/^[a-z][a-zA-Z0-9]*$/.test(name))
    throw new HozuCliError('usage', 'Give the feature a lower-case identifier', [
      'hozu add feature tasks --page /',
    ])
  if (page !== undefined && !/^\/[\w/-]*$/.test(page))
    throw new HozuCliError('usage', '--page must be a static path such as / or /tasks', [
      'Routes with params are written by hand: route({ path: "/tasks/:id", params: z.object({ id: z.string() }), search: null })',
    ])
  const configPath = resolve(cwd, config ?? 'hozu.config.ts')
  const root = dirname(configPath)
  const dir = join(root, 'features', name)
  if (existsSync(dir)) throw new HozuCliError('usage', `features/${name} already exists`, [])
  const n = namesOf(name)
  const out: AddOutput = { created: [], edited: [], manual: [], declarations: {}, texts: [] }
  await mkdir(dir, { recursive: true })
  const routesPath = join(root, 'routes.ts')
  const routesSource = existsSync(routesPath) ? await readFile(routesPath, 'utf8') : ''
  const existing =
    page === undefined
      ? null
      : new RegExp(`export const (\\w+) = route\\(\\{\\s*path: '${page.replace(/[/-]/g, '\\$&')}'`).exec(
          routesSource,
        )
  const pageRoute = page === undefined ? null : (existing?.[1] ?? `${name}Page`)
  const newRoute = page !== undefined && !existing
  const detailPath = page === undefined ? null : page === '/' ? `/${n.many}/:id` : `${page}/:id`
  const accountDir = join(root, 'features', 'account')
  const newAccount = w.auth && !existsSync(accountDir)
  const newLogin = newAccount && !/export const login = route\(/.test(routesSource)
  const files: [string, string][] = [
    [join(dir, 'model.ts'), model(n, w)],
    [join(dir, 'views.ts'), views(n, w, pageRoute)],
    [join(dir, 'feature.ts'), featureFile(n)],
    [join(dir, 'server.ts'), server(n, w)],
    ...(newAccount && pageRoute && page
      ? ([
          [join(accountDir, 'model.ts'), accountModel(pageRoute)],
          [join(accountDir, 'views.ts'), accountViews(page)],
          [join(accountDir, 'feature.ts'), accountFeature()],
          [join(accountDir, 'server.ts'), accountServer()],
        ] as [string, string][])
      : []),
  ]
  for (const [path, text] of files) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
    out.created.push(relative(cwd, path))
  }
  const edit = async (file: string, change: (s: string) => string | null, manual: string) => {
    const path = join(root, file)
    const source = existsSync(path) ? await readFile(path, 'utf8') : null
    const next = source === null ? null : change(source)
    if (next === null) out.manual.push(`${file}: ${manual}`)
    else {
      await writeFile(path, next)
      if (!out.edited.includes(relative(cwd, path))) out.edited.push(relative(cwd, path))
    }
  }
  await edit(
    'server.ts',
    (s) => {
      const wired = s.replace(
        /resolvers\(project,\s*\((?:implement)?\)\s*=>\s*\[/,
        `resolvers(project, (implement) => [\n    ${newAccount ? '...accountResolvers(implement),\n    ' : ''}...${n.resolvers}(implement),`,
      )
      if (wired === s) return null
      const withFeature = addImport(wired, `import { ${n.resolvers} } from './features/${name}/server.ts'\n`)
      return newAccount && withFeature
        ? addImport(withFeature, `import { accountResolvers } from './features/account/server.ts'\n`)
        : withFeature
    },
    `import { ${n.resolvers} } from './features/${name}/server.ts' and add ...${n.resolvers}(implement) to resolvers(project, (implement) => [...])`,
  )
  if (newAccount)
    await edit(
      'serve.ts',
      (s) => {
        const next = s.replace(
          /resolvers: createResolvers\(\),/,
          `resolvers: createResolvers(),\n  session: sessionCookie({\n    name: 'sid',\n    secret: process.env.SESSION_SECRET ?? '${randomBytes(24).toString('hex')}',\n    secure: process.env.SESSION_SECURE === 'true',\n  }),`,
        )
        return next === s ? null : addImport(next, `import { sessionCookie } from '@hozu/runtime-server'\n`)
      },
      "createServer({ ..., session: sessionCookie({ name: 'sid', secret: process.env.SESSION_SECRET, secure: false }) }) with sessionCookie from '@hozu/runtime-server'",
    )
  const newRoutes = [
    ...(newLogin ? [`export const login = route({ path: '/login', params: null, search: null })`] : []),
    ...(newRoute
      ? [`export const ${pageRoute} = route({ path: '${page}', params: null, search: null })`]
      : []),
    ...(w.detail
      ? [
          `export const ${n.detailRoute} = route({ path: '${detailPath}', params: z.object({ id: z.string() }), search: null })`,
        ]
      : []),
  ]
  if (newRoutes.length)
    await edit(
      'routes.ts',
      (source) => {
        const withZod =
          w.detail && !/from 'zod'/.test(source) ? addImport(source, `import { z } from 'zod'\n`) : source
        return withZod === null ? null : `${withZod.trimEnd()}\n${newRoutes.join('\n')}\n`
      },
      newRoutes.join('; '),
    )
  await edit(
    config ?? 'hozu.config.ts',
    (s) => {
      let next: string | null = addImport(
        s,
        `import { ${[n.View, ...(w.detail ? [n.Detail] : [])].sort().join(', ')} } from './features/${name}/views.ts'\n`,
      )
      if (next) next = addImport(next, `import { ${n.feature} } from './features/${name}/feature.ts'\n`)
      if (next && w.detail)
        next = addImport(
          next,
          `import { ${[n.get, n.list].sort().join(', ')} } from './features/${name}/model.ts'\n`,
        )
      if (next && newAccount) {
        next = addImport(next, `import { me, Session } from './features/account/model.ts'\n`)
        if (next) next = addImport(next, `import { AccountBar, Login } from './features/account/views.ts'\n`)
        if (next) next = addImport(next, `import { account } from './features/account/feature.ts'\n`)
        if (next && !/\bsession:/.test(next))
          next = next.replace(/(schema: \w+,\n)/, `$1  session: Session,\n`)
        if (next) next = append(next, /features:\s*\[([^\]]*)\]/, 'account')
      }
      if (next) next = append(next, /features:\s*\[([^\]]*)\]/, n.feature)
      const routeNames = [
        ...(newLogin ? ['login'] : []),
        ...(newRoute && pageRoute ? [pageRoute] : []),
        ...(w.detail ? [n.detailRoute] : []),
      ]
      for (const r of routeNames) if (next) next = append(next, /routes:\s*\{([^}]*)\}/, r)
      if (next && routeNames.length)
        next =
          next.replace(/import \{([^}]*)\} from '\.\/routes\.ts'/, (all, names: string) =>
            all.replace(
              names,
              ` ${[
                ...names
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
                ...routeNames,
              ]
                .sort()
                .join(', ')} `,
            ),
          ) ?? null
      if (next && w.detail)
        next = next.replace(
          /pages:\s*\[/,
          (m) =>
            `${m}\n    ui.page(${n.detailRoute}, {\n      views: [${n.Detail}],\n      head: { query: ${n.get}, input: (params) => ({ id: params.id }), render: (item) => ({ title: item.title }) },\n      entries: { query: ${n.list}, input: {}, params: (item) => ({ id: item.id }) },\n    }),`,
        )
      if (next && newAccount)
        next = next.replace(
          /pages:\s*\[/,
          (m) =>
            `${m}\n    ui.page(login, { views: [Login], head: { render: () => ({ title: 'Sign in' }) } }),`,
        )
      if (next && pageRoute) {
        const text = w.auth
          ? `ui.page(${pageRoute}, {\n      views: [AccountBar, ${n.View}],\n      head: {\n        query: me,\n        input: () => ({}),\n        render: () => ({ title: '${n.title}', noindex: true }),\n        redirects: { Unauthorized: login },\n      },\n    })`
          : `ui.page(${pageRoute}, { views: [${n.View}], head: { render: () => ({ title: '${n.title}' }) } })`
        next = newRoute
          ? next.replace(/pages:\s*\[/, (m) => `${m}\n    ${text},`)
          : replacePage(next, pageRoute, text)
      }
      return next?.replace(/\),\s*ui\.page\(/g, '),\n    ui.page(') ?? null
    },
    `import { ${n.View} } from './features/${name}/views.ts' and { ${n.feature} } from './features/${name}/feature.ts', add ${n.feature} to features${pageRoute ? ` and ui.page(${pageRoute}, { views: [${n.View}], head: { render: () => ({ title: '${n.title}' }) } }) to pages` : ''}`,
  )
  for (const file of out.created) {
    const source = await readFile(resolve(cwd, file), 'utf8')
    for (const [kind, names] of Object.entries(declarationsOf(source)))
      out.declarations[kind] = [...(out.declarations[kind] ?? []), ...names]
    out.texts.push(...textsOf(source, file))
  }
  return out
}

const KINDS: Record<string, string> = {
  event: 'events',
  query: 'queries',
  mutation: 'mutations',
  fn: 'fns',
  machine: 'machine',
  'ui.view': 'views',
  contract: 'contracts',
}

export function declarationsOf(source: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const m of source.matchAll(
    /^export const (\w+) = (event|query|mutation|fn|machine|ui\.view|contract)\(/gm,
  )) {
    const kind = KINDS[m[2]!]!
    out[kind] = [...(out[kind] ?? []), m[1]!]
  }
  return out
}

export function textsOf(source: string, file: string): AddOutput['texts'] {
  const texts: AddOutput['texts'] = []
  source.split('\n').forEach((line, i) => {
    if (/^\s*((given|when|expect|data|result|input|payload):|\{ (send|done|failed):)/.test(line)) return
    const message = /^export const [A-Z_]+ = '([^']+)'$/.exec(line)
    if (message) texts.push({ file, line: i + 1, text: message[1]! })
    const label = /\blabel: '([^']+)'/.exec(line)
    if (label) texts.push({ file, line: i + 1, text: label[1]! })
    if (file.endsWith('model.ts')) return
    const scan = line.replace(/when\(\[[^\]]*\]/g, '')
    const found = new Set<string>()
    for (const lead of scan.matchAll(/\[\s*'([^']*)'\s*,/g)) found.add(lead[1]!)
    for (const group of scan.matchAll(/\[([^[\]]*)\]/g))
      for (const lit of group[1]!.matchAll(/'([^']*)'/g))
        if ((/[A-Za-z…]/.test(lit[1]!) && !/^[a-z]+$/.test(lit[1]!)) || /^(done|open)$/.test(lit[1]!))
          found.add(lit[1]!)
    for (const text of found) if (/[A-Za-z…]/.test(text)) texts.push({ file, line: i + 1, text })
  })
  return texts
}

export function describeAdd(out: AddOutput): string {
  const lines = [
    ...out.created.map((f) => `created   ${f}`),
    ...out.edited.map((f) => `edited    ${f}`),
    ...out.manual.map((m) => `todo      ${m}`),
    ...Object.entries(out.declarations).map(([k, names]) => `${k.padEnd(10)}${names.join(' ')}`),
    ...[...new Map(out.texts.map((t) => [`${t.file}:${t.line}`, [] as string[]])).keys()].map(
      (at) =>
        `text      ${at}  ${out.texts
          .filter((t) => `${t.file}:${t.line}` === at)
          .map((t) => JSON.stringify(t.text))
          .join(' ')}`,
    ),
    'next      edit the texts above to the spec (no need to print the files; hozu map shows the structure), then hozu check',
  ]
  return `${lines.join('\n')}\n`
}
