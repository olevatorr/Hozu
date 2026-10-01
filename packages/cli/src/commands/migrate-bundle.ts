import { apply, type Edit, lineOf, type Node, type Note, parse, type Rewrite, walk } from './migrate-ast.ts'

/** `bundleWidgets` → `bundleComponents` and the `widgets` option that takes it → `components` (ADR 0045 L). */
export function migrateBundle(source: string, file: string): Rewrite {
  if (!/\bbundleWidgets\b/.test(source)) return { code: source, notes: [] }
  const program = parse(source)
  const decl = program.body.find(
    (s: Node) => s.type === 'ImportDeclaration' && s.source.value === '@hozu/bundle',
  )
  const spec = decl?.specifiers.find(
    (x: Node) => x.type === 'ImportSpecifier' && (x.imported.name ?? x.imported.value) === 'bundleWidgets',
  )
  if (!spec) return { code: source, notes: [] }
  const local = spec.local.name as string
  const edits: Edit[] = []
  const notes: Note[] = []
  if (local === 'bundleWidgets') edits.push([spec.start, spec.end, 'bundleComponents'])
  else edits.push([spec.imported.start, spec.imported.end, 'bundleComponents'])
  const bundled = (v: Node): boolean =>
    (v.type === 'Identifier' && v.name === local) ||
    (v.type === 'AwaitExpression' && bundled(v.argument)) ||
    (v.type === 'CallExpression' && v.callee.type === 'Identifier' && v.callee.name === local)
  walk(program, (n) => {
    if (local === 'bundleWidgets' && n.type === 'Identifier' && n.name === local && n !== spec.local)
      edits.push([n.start, n.end, 'bundleComponents'])
    if (n.type !== 'Property' || n.computed) return
    const name = n.key.type === 'Identifier' ? n.key.name : n.key.value
    if (name !== 'widgets') return
    if (!n.shorthand && bundled(n.value)) {
      edits.push([n.key.start, n.key.end, 'components'])
      notes.push({
        file,
        line: lineOf(source, n.start),
        rule: 'bundle',
        message: 'widgets: bundleWidgets → components: bundleComponents',
        see: 'widgets',
      })
    } else
      notes.push({
        file,
        line: lineOf(source, n.start),
        rule: 'print',
        message: 'a widgets option: the bundle of client components is passed as components',
        see: 'widgets',
        behaviour: true,
      })
  })
  return { code: apply(source, edits), notes }
}
