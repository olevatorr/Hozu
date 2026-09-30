import { existsSync, readFileSync } from 'node:fs'
import { createRequire, stripTypeScriptTypes } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { MigrateNote } from '../contract.ts'

export type Node = { type: string; start: number; end: number; [key: string]: any }

export type Note = MigrateNote

export interface Rewrite {
  code: string
  notes: Note[]
}

export type Edit = [start: number, end: number, text: string]

const require = createRequire(import.meta.url)
const acorn = createRequire(require.resolve('@hozu/transform'))('acorn') as {
  parse: (code: string, options: object) => Node
}

let warned = false
function strip(source: string): string {
  if (warned) return stripTypeScriptTypes(source, { mode: 'strip' })
  const emit = process.emitWarning
  process.emitWarning = () => {}
  try {
    return stripTypeScriptTypes(source, { mode: 'strip' })
  } finally {
    process.emitWarning = emit
    warned = true
  }
}

/** Parses TypeScript with Node's type stripping; positions match `source`. */
export function parse(source: string): Node {
  return acorn.parse(strip(source), { ecmaVersion: 'latest', sourceType: 'module' })
}

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && typeof (v as Node).type === 'string'

export const children = (n: Node): Node[] =>
  Object.entries(n).flatMap(([, v]) => (Array.isArray(v) ? v.filter(isNode) : isNode(v) ? [v] : []))

export function walk(n: Node, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null) {
  visit(n, parent)
  for (const c of children(n)) walk(c, visit, n)
}

export function parents(program: Node): Map<Node, Node> {
  const map = new Map<Node, Node>()
  walk(program, (n, p) => {
    if (p) map.set(n, p)
  })
  return map
}

export const lineOf = (source: string, at: number) => source.slice(0, at).split('\n').length

export function apply(source: string, edits: Edit[]): string {
  let code = source
  let last = Number.POSITIVE_INFINITY
  for (const [s, e, t] of [...edits].sort((a, b) => b[0] - a[0] || b[1] - a[1])) {
    if (e > last) continue
    code = code.slice(0, s) + t + code.slice(e)
    last = s
  }
  return code
}

export const keyName = (p: Node): string | null =>
  p.type !== 'Property' || p.computed
    ? null
    : p.key.type === 'Identifier'
      ? p.key.name
      : typeof p.key.value === 'string'
        ? p.key.value
        : null

export const property = (obj: Node | undefined, name: string): Node | null =>
  obj?.type === 'ObjectExpression' ? (obj.properties.find((p: Node) => keyName(p) === name) ?? null) : null

/** Local names of the named imports from `from` (imported name → local name). */
export function importsFrom(program: Node, from: string | RegExp): Map<string, string> {
  const out = new Map<string, string>()
  for (const s of program.body)
    if (
      s.type === 'ImportDeclaration' &&
      (typeof from === 'string' ? s.source.value === from : from.test(s.source.value))
    )
      for (const x of s.specifiers)
        if (x.type === 'ImportSpecifier') out.set(x.imported.name ?? x.imported.value, x.local.name)
  return out
}

/** `obj.name(...)` or `name(...)` where `obj` / `name` is the given local. */
export const callOf = (n: Node | undefined, object: string | null, name: string): boolean =>
  n?.type === 'CallExpression' &&
  (object === null
    ? n.callee.type === 'Identifier' && n.callee.name === name
    : n.callee.type === 'MemberExpression' &&
      !n.callee.computed &&
      n.callee.object.type === 'Identifier' &&
      n.callee.object.name === object &&
      n.callee.property.name === name)

/** The specifier texts of a named import as written, `type X` included (the parser sees stripped code). */
export function importItems(source: string, decl: Node): string[] {
  const text = source.slice(decl.start, decl.end)
  const open = text.indexOf('{')
  const close = text.indexOf('}', open)
  if (open < 0 || close < 0) return []
  return text
    .slice(open + 1, close)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

export const localOf = (item: string) =>
  item
    .replace(/^type\s+/, '')
    .split(/\s+as\s+/)
    .pop()!

const sortItems = (items: string[]) => [...items].sort((a, b) => localOf(a).localeCompare(localOf(b)))

export const importText = (items: string[], from: string) =>
  `import { ${sortItems(items).join(', ')} } from '${from}'`

/** Adds names to the `import { … } from '<from>'` of a module, or a new import after the last one. */
export function addImport(source: string, program: Node, from: string, names: string[]): Edit | null {
  const decl = program.body.find(
    (s: Node) =>
      s.type === 'ImportDeclaration' &&
      s.source.value === from &&
      s.importKind !== 'type' &&
      s.specifiers.every((x: Node) => x.type === 'ImportSpecifier') &&
      source.slice(s.start, s.end).includes('{'),
  )
  if (decl) {
    const items = importItems(source, decl)
    const have = new Set(items.map(localOf))
    const missing = names.filter((n) => !have.has(n))
    if (!missing.length) return null
    return [decl.start, decl.end, importText([...items, ...missing], from)]
  }
  const imports = program.body.filter((s: Node) => s.type === 'ImportDeclaration')
  const at = imports.length ? imports[imports.length - 1].end : 0
  const text = importText(names, from)
  return [at, at, at ? `\n${text}` : `${text}\n`]
}

/** Keeps only the named specifiers `keep` accepts; drops the declaration when nothing is left. */
export function filterImport(source: string, decl: Node, keep: (local: string) => boolean): Edit | null {
  const items = importItems(source, decl)
  const kept = items.filter((x) => keep(localOf(x)))
  if (kept.length === items.length) return null
  if (!kept.length) {
    const end = source[decl.end] === '\n' ? decl.end + 1 : decl.end
    return [decl.start, end, '']
  }
  return [decl.start, decl.end, importText(kept, decl.source.value)]
}

export interface Declaration {
  file: string
  source: string
  program: Node
  init: Node
}

const cache = new Map<string, { source: string; program: Node } | null>()
export const forget = () => cache.clear()

export function module(file: string): { source: string; program: Node } | null {
  if (!cache.has(file)) {
    if (!existsSync(file)) cache.set(file, null)
    else {
      const source = readFileSync(file, 'utf8')
      try {
        cache.set(file, { source, program: parse(source) })
      } catch {
        cache.set(file, null)
      }
    }
  }
  return cache.get(file) ?? null
}

function exported(program: Node, name: string): Node | null {
  for (const s of program.body) {
    const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s
    if (d?.type === 'FunctionDeclaration' && d.id?.name === name) return d
    if (d?.type === 'VariableDeclaration')
      for (const v of d.declarations)
        if (v.id.type === 'Identifier' && v.id.name === name && v.init) return v.init
  }
  return null
}

/** The initializer of `name` as seen from `file`: a local const, a named import or `ns.name`. */
export function declaration(file: string, program: Node, ref: Node, depth = 0): Declaration | null {
  if (depth > 4) return null
  const here = module(file)
  const at = (target: string, name: string): Declaration | null => {
    const m = module(target)
    if (!m) return null
    const init = exported(m.program, name)
    if (init) return { file: target, source: m.source, program: m.program, init }
    for (const s of m.program.body)
      if (s.type === 'ExportNamedDeclaration' && s.source)
        for (const x of s.specifiers)
          if ((x.exported.name ?? x.exported.value) === name)
            return (
              declaration(
                target,
                m.program,
                { type: 'Identifier', name: x.local.name, start: 0, end: 0 },
                depth + 1,
              ) ?? at(resolve(dirname(target), s.source.value), x.local.name)
            )
    return null
  }
  const lookup = (name: string, member: string | null): Declaration | null => {
    for (const s of program.body) {
      if (s.type !== 'ImportDeclaration' || !String(s.source.value).startsWith('.')) continue
      const target = resolve(dirname(file), s.source.value)
      for (const x of s.specifiers) {
        if (x.local.name !== name) continue
        if (x.type === 'ImportNamespaceSpecifier') return member ? at(target, member) : null
        if (x.type === 'ImportSpecifier' && !member) return at(target, x.imported.name ?? x.imported.value)
      }
    }
    if (member) return null
    const init = exported(program, name)
    return init && here ? { file, source: here.source, program, init } : null
  }
  if (ref.type === 'Identifier') return lookup(ref.name, null)
  if (ref.type === 'MemberExpression' && !ref.computed && ref.object.type === 'Identifier')
    return lookup(ref.object.name, ref.property.name)
  return null
}

export const literal = (n: Node | undefined): { value: unknown } | null => {
  if (!n) return null
  if (n.type === 'Literal') return { value: n.value }
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return { value: n.quasis[0].value.cooked }
  if (n.type === 'UnaryExpression' && n.operator === '-' && n.argument.type === 'Literal')
    return typeof n.argument.value === 'number' ? { value: -n.argument.value } : null
  if (n.type === 'Identifier' && n.name === 'undefined') return { value: undefined }
  return null
}
