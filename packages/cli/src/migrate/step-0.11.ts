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

/**
 * 0.10 → 0.11 (ADR 0049): every query and mutation without `runs` gets `runs: 'server'`, because 0.11 defaults to
 * `'either'` and every 0.10 implementation lives in the server resolvers. Written in the style of the object: a new
 * line with the indentation of its last property, or `, runs: 'server'` on one line.
 */
export function addRunsServer(file: string, source: string): { code: string; notes: Note[]; count: number } {
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
    const arg = n.arguments[0]
    if (arg?.type !== 'ObjectExpression') {
      notes.push({
        file,
        line: lineOf(source, n.start),
        message: `${locals.get(n.callee.name)}(…) without an object literal: add runs: 'server' by hand if its resolver is on the server`,
        see: 'fetch',
      })
      return
    }
    if (arg.properties.some((p: Node) => keyOf(p) === 'runs')) return
    if (arg.properties.some((p: Node) => p.type === 'SpreadElement')) {
      notes.push({
        file,
        line: lineOf(source, n.start),
        message: `${locals.get(n.callee.name)}({ ...spread }): add runs: 'server' by hand if its resolver is on the server`,
        see: 'fetch',
      })
      return
    }
    const q = quoteOf(source, arg)
    const last = arg.properties.at(-1) as Node | undefined
    const prop = `runs: ${q}server${q}`
    if (!last) {
      edits.push([arg.start, arg.end, `{ ${prop} }`])
      return
    }
    const multiline = source.slice(arg.start, arg.end).includes('\n')
    const end = endOf(source, js, last.end)
    const comma = /^\s*,/.exec(js.slice(end, arg.end))
    if (multiline) {
      const lineStart = source.lastIndexOf('\n', last.start) + 1
      const indent = /^[ \t]*/.exec(source.slice(lineStart))![0]
      const at = comma ? end + comma[0].length : end
      edits.push([at, at, `${comma ? '' : ','}\n${indent}${prop}${comma ? ',' : ''}`])
    } else edits.push([end, end, `, ${prop}`])
  })
  return { code: applyEdits(source, edits), notes, count: edits.length }
}

/** The 0.10 IR in 0.11 terms: every effect ran on the server, and no feature had a fetch module. */
export function normalize010(ir: Json): Json {
  const out = structuredClone(ir) as { features?: Record<string, Record<string, Json>> }
  for (const f of Object.values(out.features ?? {})) {
    for (const kind of ['queries', 'mutations'])
      for (const e of Object.values((f[kind] ?? {}) as Record<string, Record<string, Json>>))
        e.runs = 'server'
    f.fetch = null
  }
  return out as Json
}
