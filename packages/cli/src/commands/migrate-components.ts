import { dirname, resolve } from 'node:path'
import {
  apply,
  callOf,
  type Edit,
  importsFrom,
  indentAt,
  keyName,
  lineOf,
  type Node,
  type Note,
  parse,
  property,
  walk,
} from './migrate-ast.ts'

interface Widget {
  file: string
  name: string
  call: Node
  tag: string | null
  wraps: boolean | null
  given: boolean
}

const parsed = (source: string): Node | null => {
  try {
    return parse(source)
  } catch {
    return null
  }
}

const key = (file: string, name: string) => `${file}#${name}`

function declared(file: string, program: Node, out: Map<string, Widget>) {
  const ui = importsFrom(program, '@hozu/core').get('ui')
  if (!ui) return
  walk(program, (n) => {
    if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || !callOf(n.init, ui, 'widget')) return
    const options = n.init.arguments[0]
    const tag = property(options, 'tag')?.value
    const wraps = property(options, 'wraps')?.value
    out.set(key(file, n.id.name), {
      file,
      name: n.id.name,
      call: n.init,
      tag: tag?.type === 'Literal' && typeof tag.value === 'string' ? tag.value : null,
      wraps: !wraps
        ? false
        : wraps.type === 'Literal' && typeof wraps.value === 'boolean'
          ? wraps.value
          : null,
      given: false,
    })
  })
}

/** The widget a `ui.use` target names: a local const, a named import or `ns.Name` (ADR 0045 L). */
function target(file: string, program: Node, ref: Node): string | null {
  const local = (name: string, member: string | null) => {
    for (const s of program.body) {
      if (s.type !== 'ImportDeclaration' || !String(s.source.value).startsWith('.')) continue
      const from = resolve(dirname(file), s.source.value)
      for (const x of s.specifiers) {
        if (x.local.name !== name) continue
        if (x.type === 'ImportNamespaceSpecifier') return member ? key(from, member) : null
        if (x.type === 'ImportSpecifier' && !member) return key(from, x.imported.name ?? x.imported.value)
      }
    }
    return member ? null : key(file, name)
  }
  if (ref.type === 'Identifier') return local(ref.name, null)
  if (ref.type === 'MemberExpression' && !ref.computed && ref.object.type === 'Identifier')
    return local(ref.object.name, ref.property.name)
  return null
}

const empty = (n: Node | undefined) => !n || (n.type === 'ArrayExpression' && n.elements.length === 0)

const builder = (ui: string, tag: string) =>
  /^[a-z][a-z0-9]*$/.test(tag) ? `${ui}.${tag}` : `${ui}['${tag}']`

/**
 * `ui.widget` → `ui.component({ client })`, `@hozu/core/widget` → `@hozu/core/component`, and the empty
 * children of uses of components that take none (ADR 0045 L).
 */
export function migrateComponents(files: Map<string, string>): { files: Map<string, string>; notes: Note[] } {
  const programs = new Map<string, Node>()
  for (const [file, source] of files)
    if (/\bwidget\b|@hozu\/core\/widget/.test(source)) {
      const program = parsed(source)
      if (program) programs.set(file, program)
    }
  const widgets = new Map<string, Widget>()
  for (const [file, program] of programs) declared(file, program, widgets)
  const uses: [file: string, call: Node, widget: Widget][] = []
  for (const [file, source] of files) {
    if (!widgets.size || !/\.use\(/.test(source)) continue
    const program = programs.get(file) ?? parsed(source)
    if (!program) continue
    programs.set(file, program)
    const ui = importsFrom(program, '@hozu/core').get('ui')
    if (!ui) continue
    walk(program, (n) => {
      if (!callOf(n, ui, 'use')) return
      const id = n.arguments[0] ? target(file, program, n.arguments[0]) : null
      const w = id ? widgets.get(id) : undefined
      if (!w) return
      uses.push([file, n, w])
      if (!empty(n.arguments[2])) w.given = true
    })
  }
  const edits = new Map<string, Edit[]>()
  const add = (file: string, edit: Edit) => edits.set(file, [...(edits.get(file) ?? []), edit])
  const notes: Note[] = []
  for (const w of widgets.values()) {
    const source = files.get(w.file)!
    const line = lineOf(source, w.call.start)
    if (w.tag === null || w.wraps === null) {
      notes.push({
        file: w.file,
        line,
        rule: 'component',
        message: `ui.widget ${w.name} has a computed ${w.tag === null ? 'tag' : 'wraps'}: rewrite it as ui.component({ client, load, render }) by hand`,
        see: 'widgets',
        behaviour: true,
      })
      continue
    }
    const ui = w.call.callee.object.name as string
    const options = w.call.arguments[0]
    add(w.file, [w.call.callee.property.start, w.call.callee.property.end, 'component'])
    const events = property(options, 'events')
    if (events?.value.type === 'ObjectExpression' && events.value.properties.length === 0) {
      const next = options.properties[options.properties.indexOf(events) + 1]
      add(w.file, [events.start, next ? next.start : events.end, ''])
    } else if (events) add(w.file, [events.key.start, events.key.end, 'emits'])
    const children = w.wraps || w.given
    const indent = indentAt(source, (property(options, 'tag') ?? options).start)
    const render = children
      ? `children: true,\n${indent}render: ({ children }) => ${builder(ui, w.tag)}({}, children)`
      : `render: () => ${builder(ui, w.tag)}({}, [])`
    const wraps = options.properties.find((p: Node) => keyName(p) === 'wraps')
    if (wraps) add(w.file, [wraps.start, wraps.end, render])
    else {
      const last = options.properties.at(-1)
      add(
        w.file,
        last ? [last.end, last.end, `,\n${indent}${render}`] : [options.start + 1, options.start + 1, render],
      )
    }
    notes.push({
      file: w.file,
      line,
      rule: 'component',
      message: `ui.widget ${w.name} → ui.component({ client }) with ${children ? 'its children as the render' : 'an empty root'}`,
      see: 'widgets',
    })
    if (w.given && !w.wraps)
      notes.push({
        file: w.file,
        line,
        rule: 'component',
        message: `${w.name} had wraps: false, but a use passes children: the render keeps them as its server HTML, and inside another island the client now hydrates them before the module takes over`,
        see: 'widgets',
        behaviour: true,
      })
  }
  for (const [file, call, w] of uses) {
    if (w.wraps || w.given || w.tag === null || w.wraps === null) continue
    const [, options, given] = call.arguments
    if (given && options) add(file, [options.end, given.end, ''])
  }
  for (const [file, program] of programs)
    for (const s of program.body)
      if (s.type === 'ImportDeclaration' && s.source.value === '@hozu/core/widget') {
        const source = files.get(file)!
        const quote = source[s.source.start]
        add(file, [s.source.start, s.source.end, `${quote}@hozu/core/component${quote}`])
      }
  const out = new Map<string, string>()
  for (const [file, list] of edits) out.set(file, apply(files.get(file)!, list))
  return { files: out, notes }
}
