import { createRequire, stripTypeScriptTypes } from 'node:module'

export type Node = { type: string; start: number; end: number; [key: string]: any }

export interface Note {
  file: string
  line: number
  message: string
  see: string | null
}

const require = createRequire(import.meta.url)
const acorn = createRequire(require.resolve('@hozu/transform'))('acorn') as {
  parse: (code: string, options: object) => Node
}

let quiet = false
function strip(source: string): string {
  if (quiet) return stripTypeScriptTypes(source, { mode: 'strip' })
  const emit = process.emitWarning
  process.emitWarning = () => {}
  try {
    quiet = true
    return stripTypeScriptTypes(source, { mode: 'strip' })
  } finally {
    process.emitWarning = emit
  }
}

/** Parses TypeScript with its types replaced by spaces, so every position is the source's position. */
export const parse = (source: string): Node => parseStripped(source).program

/** The program and the stripped text it was parsed from (types are spaces there). */
export function parseStripped(source: string): { program: Node; js: string } {
  const js = strip(source)
  return { program: acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' }), js }
}

/**
 * Where a property really ends in the source: after a type assertion such as `x as T`, which the stripped text holds
 * as spaces. It is the next non-space character of the stripped text, stepped back over the source's whitespace.
 */
export function endOf(source: string, js: string, end: number): number {
  let at = end
  while (at < js.length && /\s/.test(js[at]!)) at++
  while (at > end && /\s/.test(source[at - 1]!)) at--
  return at
}

export function walk(node: Node, visit: (n: Node) => void): void {
  visit(node)
  for (const key of Object.keys(node)) {
    const v = node[key]
    if (Array.isArray(v)) for (const x of v) if (x && typeof x.type === 'string') walk(x, visit)
    if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, visit)
  }
}

export const lineOf = (source: string, at: number): number => source.slice(0, at).split('\n').length

/** Local names of the given `@hozu/core` exports in this module. */
export function coreLocals(program: Node, names: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const stmt of program.body)
    if (stmt.type === 'ImportDeclaration' && stmt.source.value === '@hozu/core')
      for (const s of stmt.specifiers)
        if (s.type === 'ImportSpecifier' && names.includes(s.imported.name))
          out.set(s.local.name, s.imported.name)
  return out
}

export type Edit = [start: number, end: number, text: string]

export const applyEdits = (source: string, edits: Edit[]): string =>
  [...edits].sort((a, b) => b[0] - a[0]).reduce((s, [a, b, t]) => s.slice(0, a) + t + s.slice(b), source)
