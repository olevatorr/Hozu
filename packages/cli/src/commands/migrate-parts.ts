import { transform } from '@hozu/transform'
import {
  addImport,
  apply,
  declaration,
  type Edit,
  lineOf,
  type Node,
  type Note,
  parse,
  walk,
} from './migrate-ast.ts'

type Site = [kind: 'helper' | 'global' | 'callback' | 'typeof', name: string, line: number, column: number]

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'])

function sitesOf(code: string): Site[] {
  const out: Site[] = []
  for (let at = code.indexOf('[["'); at >= 0; at = code.indexOf('[["', at + 1)) {
    let depth = 0
    let end = at
    for (; end < code.length; end++) {
      if (code[end] === '[') depth++
      else if (code[end] === ']' && --depth === 0) break
    }
    try {
      const list = JSON.parse(code.slice(at, end + 1)) as Site[]
      if (list.every((s) => Array.isArray(s) && s.length === 4)) out.push(...list)
    } catch {}
  }
  return out
}

const calledImports = (code: string) =>
  new Set([...code.matchAll(/__hozu\.call\(([A-Za-z_$][\w$]*), "\1"/g)].map((m) => m[1]!))

function moduleFunction(program: Node, name: string): { stmt: Node; fn: Node; id: Node } | null {
  for (const s of program.body) {
    const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s
    if (d?.type === 'FunctionDeclaration' && d.id?.name === name) return { stmt: s, fn: d, id: d.id }
    if (d?.type === 'VariableDeclaration')
      for (const v of d.declarations)
        if (v.id.type === 'Identifier' && v.id.name === name && v.init && FUNCTIONS.has(v.init.type))
          return { stmt: s, fn: v.init, id: v.id }
  }
  return null
}

function operatesOnParams(fn: Node): boolean {
  const params = new Set<string>()
  for (const p of fn.params) walk(p, (n) => n.type === 'Identifier' && params.add(n.name))
  let found = false
  walk(fn.body, (n) => {
    if (found) return
    const op =
      (n.type === 'BinaryExpression' && n.operator !== 'in') ||
      n.type === 'LogicalExpression' ||
      n.type === 'ConditionalExpression' ||
      (n.type === 'UnaryExpression' && n.operator === '!') ||
      (n.type === 'TemplateLiteral' && n.expressions.length > 0)
    if (!op) return
    walk(n, (x) => {
      if (x.type === 'Identifier' && params.has(x.name)) found = true
    })
  })
  return found
}

/** Plain helpers that receive references → `part()` (ADR 0043 H, HZ059); every other escape is printed. */
export function migrateParts(files: Map<string, string>): { files: Map<string, string>; notes: Note[] } {
  const notes: Note[] = []
  const targets = new Map<string, Map<string, number>>()
  const target = (file: string, name: string, line: number) => {
    const m = targets.get(file) ?? new Map<string, number>()
    if (!m.has(name)) m.set(name, line)
    targets.set(file, m)
  }
  for (const [file, source] of files) {
    if (!/@hozu\/core/.test(source)) continue
    let code: string
    try {
      code = transform(source, file).code
    } catch {
      continue
    }
    for (const [kind, name, line] of sitesOf(code)) {
      if (kind === 'helper' || kind === 'callback') target(file, name, line)
      else
        notes.push({
          file,
          line,
          rule: 'part',
          message: `${name} runs on a reference (HZ059): use an operator or a fn()`,
          see: 'views',
        })
    }
    const program = parse(source)
    for (const name of calledImports(code)) {
      const d = declaration(file, program, { type: 'Identifier', name, start: 0, end: 0 })
      if (d && FUNCTIONS.has(d.init.type) && d.file !== file) target(d.file, name, 0)
    }
  }
  const out = new Map<string, string>()
  for (const [file, names] of targets) {
    const source = out.get(file) ?? files.get(file)
    if (source === undefined) continue
    const program = parse(source)
    const edits: Edit[] = []
    for (const [name, line] of names) {
      const found = moduleFunction(program, name)
      if (!found) {
        notes.push({
          file,
          line,
          rule: 'part',
          message: `${name} receives references but is not a module-level function: make it a part() by hand (HZ059)`,
          see: 'views',
        })
        continue
      }
      const { stmt, fn, id } = found
      if (fn.async || fn.generator) {
        notes.push({
          file,
          line: lineOf(source, fn.start),
          rule: 'part',
          message: `${name} is async or a generator: a part() cannot be; rewrite it by hand (HZ059)`,
          see: 'views',
        })
        continue
      }
      const d2 = operatesOnParams(fn)
      notes.push({
        file,
        line: lineOf(source, fn.start),
        rule: 'part',
        message: d2
          ? `${name} → part(): it applies operators to its arguments, which ran on the placeholder in 0.7 (a D2 site); after the upgrade, hozu migrate 0.8 lists the IR that changed`
          : `${name} → part() (the IR is unchanged)`,
        see: 'views',
        behaviour: d2,
      })
      if (fn.type === 'FunctionDeclaration') {
        const exported = stmt.type === 'ExportNamedDeclaration' ? 'export ' : ''
        const head = source.slice(id.end, fn.body.start).trimEnd()
        edits.push([
          stmt.start,
          stmt.end,
          `${exported}const ${name} = part(${head} => ${source.slice(fn.body.start, fn.body.end)})`,
        ])
      } else edits.push([fn.start, fn.end, `part(${source.slice(fn.start, fn.end)})`])
    }
    if (!edits.length) continue
    const imp = addImport(source, program, '@hozu/core', ['part'])
    if (imp) edits.push(imp)
    out.set(file, apply(source, edits))
  }
  return { files: out, notes }
}
