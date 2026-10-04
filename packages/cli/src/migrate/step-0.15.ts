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
