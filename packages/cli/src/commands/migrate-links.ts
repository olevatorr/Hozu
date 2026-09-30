import {
  apply,
  callOf,
  declaration,
  type Edit,
  importsFrom,
  keyName,
  lineOf,
  literal,
  type Node,
  type Note,
  parse,
  property,
  type Rewrite,
  walk,
} from './migrate-ast.ts'

export type SearchDefaults = Map<string, Record<string, unknown>>

const foldable = (v: unknown, fallback: unknown) =>
  v === null || (v !== undefined && typeof v !== 'object' && v === fallback)

function defaultsOf(file: string, program: Node, route: Node, byPath: SearchDefaults) {
  const decl = declaration(file, program, route)
  const path =
    decl?.init.type === 'CallExpression' ? literal(property(decl.init.arguments[0], 'path')?.value) : null
  return typeof path?.value === 'string' ? (byPath.get(path.value) ?? null) : null
}

/** `ui.link(r, p, null)`, `{}` and search fields equal to the route defaults → `ui.link(r, p)` (ADR 0043 G). */
export function migrateLinks(source: string, file: string, byPath: SearchDefaults = new Map()): Rewrite {
  if (!/\.link\s*\(/.test(source)) return { code: source, notes: [] }
  const program = parse(source)
  const ui = importsFrom(program, '@hozu/core').get('ui')
  if (!ui) return { code: source, notes: [] }
  const edits: Edit[] = []
  const notes: Note[] = []
  walk(program, (n) => {
    if (!callOf(n, ui, 'link') || n.arguments.length < 3) return
    const [route, params, search] = n.arguments
    const drop = () => edits.push([params.end, search.end, ''])
    if (search.type === 'Literal' && search.value === null) return drop()
    if (search.type !== 'ObjectExpression') return
    if (search.properties.length === 0) return drop()
    const defaults = defaultsOf(file, program, route, byPath)
    const removed: Node[] = []
    for (const p of search.properties) {
      const k = keyName(p)
      const v = literal(p.value)
      if (k && v && foldable(v.value, defaults?.[k])) removed.push(p)
    }
    if (!removed.length) return
    if (removed.length === search.properties.length) return drop()
    const kept = search.properties
      .filter((p: Node) => !removed.includes(p))
      .map((p: Node) => source.slice(p.start, p.end))
    edits.push([search.start, search.end, `{ ${kept.join(', ')} }`])
    notes.push({
      file,
      line: lineOf(source, n.start),
      rule: 'link',
      message: `ui.link search: dropped ${removed.map((p) => keyName(p)).join(', ')} (null or the route default)`,
      see: 'views',
    })
  })
  return { code: apply(source, edits), notes }
}
