import {
  apply,
  callOf,
  type Edit,
  importsFrom,
  lineOf,
  type Note,
  parse,
  property,
  type Rewrite,
  walk,
} from './migrate-ast.ts'

/** User-scoped `'static'`, `{ revalidate }` and `{ swr }` → `'request'` (ADR 0043 A, HZ049). */
export function migrateFreshness(source: string, file: string): Rewrite {
  if (!/\bscope\s*:\s*['"]user['"]/.test(source)) return { code: source, notes: [] }
  const program = parse(source)
  const query = importsFrom(program, '@hozu/core').get('query')
  if (!query) return { code: source, notes: [] }
  const notes: Note[] = []
  const edits: Edit[] = []
  walk(program, (n) => {
    if (!callOf(n, null, query)) return
    const options = n.arguments[0]
    const scope = property(options, 'scope')
    const freshness = property(options, 'freshness')
    if (scope?.value.type !== 'Literal' || scope.value.value !== 'user' || !freshness) return
    const v = freshness.value
    if (v.type === 'Literal' && (v.value === 'request' || v.value === 'live')) return
    const was = source.slice(v.start, v.end)
    const known =
      (v.type === 'Literal' && v.value === 'static') ||
      (v.type === 'ObjectExpression' && (property(v, 'revalidate') || property(v, 'swr')))
    if (!known) {
      notes.push({
        file,
        line: lineOf(source, n.start),
        rule: 'freshness',
        message: `user-scoped freshness ${was} is not a literal: use 'request' (or 'live' for push), HZ049`,
        see: 'data',
      })
      return
    }
    edits.push([v.start, v.end, `'request'`])
    notes.push({
      file,
      line: lineOf(source, n.start),
      rule: 'freshness',
      message: `user-scoped freshness ${was} → 'request': user data is read on every request`,
      see: 'data',
    })
  })
  return { code: apply(source, edits), notes }
}
