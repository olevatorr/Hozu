import type { Json } from '@hozu/core/ir'
import {
  applyEdits,
  coreLocals,
  type Edit,
  endOf,
  lineOf,
  type Node,
  type Note,
  parseStripped,
  walk,
} from './ast.ts'

const keyOf = (p: Node) =>
  p.type === 'Property' ? (p.key.type === 'Identifier' ? p.key.name : String(p.key.value)) : null

/** The quote the object already uses for a string value, else the module's usual quote. */
function quoteOf(source: string, object: Node): string {
  for (const p of object.properties)
    if (p.type === 'Property' && p.value.type === 'Literal' && typeof p.value.value === 'string')
      return source[p.value.start] === '"' ? '"' : "'"
  return (source.match(/'/g)?.length ?? 0) >= (source.match(/"/g)?.length ?? 0) ? "'" : '"'
}

const literalOf = (object: Node, key: string): unknown => {
  const p = object.properties.find((x: Node) => keyOf(x) === key)
  return p?.value?.type === 'Literal' ? p.value.value : undefined
}

/** Inserts `prop` as the object's last property, in its style: a new indented line, or `, prop` on one line. */
function append(source: string, js: string, object: Node, prop: string, edits: Edit[]) {
  const last = object.properties.at(-1) as Node | undefined
  if (!last) {
    edits.push([object.start, object.end, `{ ${prop} }`])
    return
  }
  const end = endOf(source, js, last.end)
  const comma = /^\s*,/.exec(js.slice(end, object.end))
  if (source.slice(object.start, object.end).includes('\n')) {
    const lineStart = source.lastIndexOf('\n', last.start) + 1
    const indent = /^[ \t]*/.exec(source.slice(lineStart))![0]
    const at = comma ? end + comma[0].length : end
    edits.push([at, at, `${comma ? '' : ','}\n${indent}${prop}${comma ? ',' : ''}`])
  } else edits.push([end, end, `, ${prop}`])
}

/**
 * 0.14 → 0.15 (ADR 0056 B): every server-run `scope: 'user'` query and every server-run mutation gets
 * `access: 'anyone'`, which is the 0.14 behaviour. HZ090 then lists the user queries to tighten.
 */
export function addAccess(file: string, source: string): { code: string; notes: Note[]; count: number } {
  if (!source.includes('@hozu/core')) return { code: source, notes: [], count: 0 }
  let program: Node
  let js: string
  try {
    ;({ program, js } = parseStripped(source))
  } catch {
    return { code: source, notes: [], count: 0 }
  }
  const locals = coreLocals(program, ['query', 'mutation'])
  if (!locals.size) return { code: source, notes: [], count: 0 }
  const edits: Edit[] = []
  const notes: Note[] = []
  walk(program, (n) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || !locals.has(n.callee.name)) return
    const kind = locals.get(n.callee.name)
    const arg = n.arguments[0]
    if (arg?.type !== 'ObjectExpression') return
    if (arg.properties.some((p: Node) => keyOf(p) === 'access')) return
    const runs = literalOf(arg, 'runs')
    const needs =
      kind === 'mutation' ? runs === 'server' : runs === 'server' && literalOf(arg, 'scope') === 'user'
    const unknown =
      runs === undefined ||
      (kind === 'query' && literalOf(arg, 'scope') === undefined) ||
      arg.properties.some((p: Node) => p.type === 'SpreadElement')
    if (unknown) {
      notes.push({
        file,
        line: lineOf(source, n.start),
        message: `${kind}(…) whose runs or scope is not a literal: add access by hand if it runs on the server`,
        see: 'auth',
      })
      return
    }
    if (needs) append(source, js, arg, `access: ${quoteOf(source, arg)}anyone${quoteOf(source, arg)}`, edits)
  })
  return { code: applyEdits(source, edits), notes, count: edits.length }
}

/** The 0.14 IR in 0.15 terms: every effect that now needs access had the behaviour of 'anyone'. */
export function normalize014(ir: Json): Json {
  const out = structuredClone(ir) as { features?: Record<string, Record<string, Record<string, Json>>> }
  for (const f of Object.values(out.features ?? {})) {
    for (const q of Object.values(f.queries ?? {}) as Record<string, Json>[])
      if (q.scope === 'user' && q.runs === 'server' && !q.access) q.access = { kind: 'anyone' }
    for (const m of Object.values(f.mutations ?? {}) as Record<string, Json>[])
      if (m.runs === 'server' && !m.access) m.access = { kind: 'anyone' }
  }
  return out as Json
}

const RESERVED = 'Forbidden'
const RENAMED = 'NotAllowed'

const named = (n: Node | undefined, name: string) =>
  !!n && ((n.type === 'Identifier' && n.name === name) || (n.type === 'Literal' && n.value === name))

const renamed = (source: string, n: Node): Edit =>
  n.type === 'Identifier'
    ? [n.start, n.end, RENAMED]
    : [n.start, n.end, `${source[n.start]}${RENAMED}${source[n.start]}`]

/**
 * 0.14 → 0.15 (ADR 0059 C): `Forbidden` is the framework's access error since 0.15, so an error the app declared
 * under that name becomes `NotAllowed` everywhere 0.14 code names an error: `errors` / `failed` keys, `fail(…)` and
 * a contract's `error`. 0.14 had no framework `Forbidden`, so every such name is the app's own.
 */
export function renameForbidden(
  file: string,
  source: string,
): { code: string; notes: Note[]; count: number } {
  if (!source.includes(RESERVED)) return { code: source, notes: [], count: 0 }
  let program: Node
  try {
    program = parseStripped(source).program
  } catch {
    return { code: source, notes: [], count: 0 }
  }
  const edits: Edit[] = []
  walk(program, (n) => {
    if (
      n.type === 'Property' &&
      ['errors', 'failed'].includes(keyOf(n) ?? '') &&
      n.value.type === 'ObjectExpression'
    )
      for (const p of n.value.properties)
        if (p.type === 'Property' && named(p.key, RESERVED))
          edits.push(p.shorthand ? [p.start, p.end, `${RENAMED}: ${RESERVED}`] : renamed(source, p.key))
    if (n.type === 'Property' && keyOf(n) === 'error' && named(n.value, RESERVED))
      edits.push(renamed(source, n.value))
    if (n.type === 'CallExpression') {
      const callee = n.callee.type === 'MemberExpression' ? n.callee.property : n.callee
      if (named(callee, 'fail') && named(n.arguments[0], RESERVED))
        edits.push(renamed(source, n.arguments[0]))
    }
  })
  const notes: Note[] =
    edits.length && source.includes(RENAMED)
      ? [
          {
            file,
            line: 1,
            message: `${RENAMED} is already a name here: check the renamed errors by hand`,
            see: 'auth',
          },
        ]
      : []
  return { code: applyEdits(source, edits), notes, count: edits.length }
}

const declaresForbidden = (ir: Json) =>
  Object.values(
    (ir as { features?: Record<string, Record<string, Record<string, { errors?: object }>>> }).features ?? {},
  ).some((f) =>
    ['queries', 'mutations', 'endpoints'].some((k) =>
      Object.values(f[k] ?? {}).some((e) => !!e.errors && RESERVED in e.errors),
    ),
  )

const renameIn = (value: Json): Json => {
  if (typeof value === 'string')
    return value === RESERVED ? RENAMED : value.replace(new RegExp(`/${RESERVED}(?=/|$)`, 'g'), `/${RENAMED}`)
  if (Array.isArray(value)) return value.map(renameIn)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k === RESERVED ? RENAMED : (renameIn(k) as string),
        renameIn(v as Json),
      ]),
    )
  return value
}

export const accessStep = (file: string, source: string) => {
  const first = renameForbidden(file, source)
  const second = addAccess(file, first.code)
  return { code: second.code, notes: [...first.notes, ...second.notes], count: first.count + second.count }
}

export const normalize014Renamed = (ir: Json): Json => normalize014(declaresForbidden(ir) ? renameIn(ir) : ir)
