import {
  apply,
  declaration,
  type Edit,
  filterImport,
  importsFrom,
  lineOf,
  literal,
  type Node,
  type Note,
  parse,
  property,
  type Rewrite,
  walk,
} from './migrate-ast.ts'

const identifier = (s: string) => {
  const words = s.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const name = words.map((w, i) => (i ? w[0]!.toUpperCase() + w.slice(1) : w)).join('')
  return /^[A-Za-z_]/.test(name) ? name : `form${name}`
}

/** A string `form` attribute and the form with that `id` → one `ui.formRef()` (ADR 0043 C). */
export function migrateForms(source: string, file: string): Rewrite {
  if (!/\bform\s*:/.test(source)) return { code: source, notes: [] }
  const program = parse(source)
  const ui = importsFrom(program, '@hozu/core').get('ui')
  if (!ui) return { code: source, notes: [] }
  const text = (n: Node): string | null => {
    const l = literal(n)
    if (l) return typeof l.value === 'string' ? l.value : null
    const d = declaration(file, program, n)
    const v = d ? literal(d.init) : null
    return typeof v?.value === 'string' ? v.value : null
  }
  const element = (n: Node) =>
    n.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    n.callee.object.type === 'Identifier' &&
    n.callee.object.name === ui &&
    !n.callee.computed
  const controls: { prop: Node; value: string }[] = []
  const forms = new Map<string, Node[]>()
  walk(program, (n) => {
    if (!element(n) || n.arguments[0]?.type !== 'ObjectExpression') return
    const tag = n.callee.property.name
    if (tag === 'form') {
      const id = property(n.arguments[0], 'id')
      const v = id ? text(id.value) : null
      if (id && v !== null) forms.set(v, [...(forms.get(v) ?? []), id])
      return
    }
    const form = property(n.arguments[0], 'form')
    const v = form ? text(form.value) : null
    if (form && v !== null) controls.push({ prop: form, value: v })
  })
  if (!controls.length) return { code: source, notes: [] }
  const notes: Note[] = []
  const edits: Edit[] = []
  const taken = new Set<string>()
  walk(program, (n) => {
    if (n.type === 'Identifier') taken.add(n.name)
  })
  const refs = new Map<string, string>()
  const replaced = new Set<string>()
  for (const { prop, value } of controls) {
    const owners = forms.get(value) ?? []
    if (owners.length !== 1) {
      notes.push({
        file,
        line: lineOf(source, prop.start),
        rule: 'form',
        message: owners.length
          ? `form: '${value}' names ${owners.length} forms in this module: declare one ui.formRef() per form by hand`
          : `form: '${value}' names no form of this module: declare a ui.formRef() and hold it with ui.form({ ref }) (HZ014)`,
        see: 'forms',
      })
      continue
    }
    let name = refs.get(value)
    if (!name) {
      name = identifier(value)
      while (taken.has(name)) name = `${name}Form`
      taken.add(name)
      refs.set(value, name)
      edits.push([owners[0]!.start, owners[0]!.end, `ref: ${name}`])
      if (owners[0]!.value.type === 'Identifier') replaced.add(owners[0]!.value.name)
    }
    if (prop.value.type === 'Identifier') replaced.add(prop.value.name)
    edits.push([prop.value.start, prop.value.end, name])
    notes.push({
      file,
      line: lineOf(source, prop.start),
      rule: 'form',
      message: `form: '${value}' → ui.formRef() ${name}`,
      see: 'forms',
    })
  }
  if (!refs.size) return { code: source, notes }
  const decls = [...refs.values()].map((n) => `const ${n} = ${ui}.formRef()`).join('\n')
  const imports = program.body.filter((s: Node) => s.type === 'ImportDeclaration')
  const at = imports.length ? imports[imports.length - 1].end : 0
  edits.push([at, at, `\n\n${decls}`])
  let code = apply(source, edits)
  code = dropUnused(code, replaced)
  return { code, notes }
}

function dropUnused(code: string, names: Set<string>): string {
  const program = parse(code)
  const used = new Set<string>()
  walk(program, (n, p) => {
    if (n.type === 'Identifier' && p?.type !== 'ImportSpecifier') used.add(n.name)
  })
  const edits: Edit[] = []
  for (const s of program.body) {
    if (s.type !== 'ImportDeclaration' || !String(s.source.value).startsWith('.')) continue
    const e = filterImport(code, s, (local) => used.has(local) || !names.has(local))
    if (e) edits.push(e)
  }
  return apply(code, edits)
}
