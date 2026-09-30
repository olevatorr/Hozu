import {
  apply,
  children,
  type Edit,
  filterImport,
  importsFrom,
  indentAt,
  lineOf,
  type Node,
  type Note,
  parents,
  parse,
  type Rewrite,
  styleOf,
} from './migrate-ast.ts'

const COMPARE: Record<string, string> = { eq: '===', neq: '!==', lt: '<', lte: '<=', gt: '>', gte: '>=' }
const ASSIGN = new Set(['set', 'append', 'inc', 'removeWhere'])
const RANK = { low: 0, cond: 1, coalesce: 2, or: 3, and: 4, eq: 5, rel: 6, arith: 7, unary: 8, primary: 9 }
type Kind = keyof typeof RANK

/** `op.*` → TypeScript operators, a motion-less `ui.if` → `?:` / `&&` (ADR 0043 G7). */
export function migrateOps(source: string, file: string): Rewrite {
  const program = parse(source)
  const core = importsFrom(program, '@hozu/core')
  const opName = core.get('op') ?? null
  const uiName = core.get('ui') ?? null
  if (!opName && !uiName) return { code: source, notes: [] }
  const notes: Note[] = []
  const style = styleOf(source)
  const note = (n: Node, message: string, behaviour = false) =>
    notes.push({ file, line: lineOf(source, n.start), rule: 'op', message, see: 'views', behaviour })
  const parent = parents(program)
  const opCall = (n: Node | undefined): string | null =>
    opName &&
    n?.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    n.callee.object.type === 'Identifier' &&
    n.callee.object.name === opName &&
    !n.callee.computed
      ? n.callee.property.name
      : null
  const uiIf = (n: Node | undefined) =>
    !!uiName &&
    n?.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    n.callee.object.type === 'Identifier' &&
    n.callee.object.name === uiName &&
    n.callee.property.name === 'if' &&
    n.arguments.length === 3
  const assignFn = (n: Node | undefined) => {
    if (n?.type !== 'ArrowFunctionExpression') return false
    const p = parent.get(n)
    const body = n.body.type === 'ArrayExpression' ? n.body : null
    return (
      p?.type === 'Property' &&
      p.key?.name === 'assign' &&
      !!body &&
      body.elements.length > 0 &&
      body.elements.every((e: Node) => ASSIGN.has(opCall(e) ?? ''))
    )
  }
  const rewrites = (n: Node) => (opCall(n) !== null && !ASSIGN.has(opCall(n)!)) || uiIf(n) || assignFn(n)

  const kind = (n: Node): Kind => {
    const name = opCall(n)
    if (name && name in COMPARE) return name === 'eq' || name === 'neq' ? 'eq' : 'rel'
    if (name === 'and' || name === 'or') return n.arguments.length === 1 ? kind(n.arguments[0]) : name
    if (name === 'not') return 'unary'
    if (uiIf(n)) return 'cond'
    if (n.type === 'LogicalExpression')
      return n.operator === '&&' ? 'and' : n.operator === '||' ? 'or' : 'coalesce'
    if (n.type === 'BinaryExpression')
      return ['===', '!==', '==', '!='].includes(n.operator)
        ? 'eq'
        : ['<', '<=', '>', '>=', 'in', 'instanceof'].includes(n.operator)
          ? 'rel'
          : 'arith'
    if (n.type === 'ConditionalExpression') return 'cond'
    if (n.type === 'UnaryExpression') return 'unary'
    if (['AssignmentExpression', 'ArrowFunctionExpression', 'SequenceExpression'].includes(n.type))
      return 'low'
    return 'primary'
  }
  const operand = (n: Node, min: number) => {
    const text = emit(n)
    const k = kind(n)
    return RANK[k] < min || (k === 'coalesce' && min >= RANK.or) ? `(${text})` : text
  }
  const valuePosition = (n: Node) => {
    for (let x = n, up = parent.get(n); up; x = up, up = parent.get(up)) {
      const name = opCall(up)
      if (name === 'and' || name === 'or' || name === 'not') continue
      if (up.type === 'ReturnStatement' || up.type === 'BlockStatement') continue
      if (uiIf(up)) return up.arguments[0] !== x
      if (up.type === 'ArrowFunctionExpression' || up.type === 'FunctionExpression') {
        const p = parent.get(up)
        return !(p?.type === 'Property' && p.key?.name === 'guard')
      }
      return true
    }
    return true
  }
  const branch = (n: Node) => {
    if (n.type !== 'ArrayExpression') return { text: emit(n), empty: false }
    if (n.elements.length === 0) return { text: 'null', empty: true }
    if (n.elements.length === 1 && n.elements[0].type !== 'SpreadElement')
      return { text: operand(n.elements[0], RANK.cond + 1), empty: false }
    return { text: emit(n), empty: false }
  }

  let sites = 0
  function emit(n: Node): string {
    const name = opCall(n)
    if (name || uiIf(n) || assignFn(n)) sites++
    if (name && name in COMPARE)
      return `${operand(n.arguments[0], RANK.eq + 1)} ${COMPARE[name]} ${operand(n.arguments[1], RANK.eq + 1)}`
    if (name === 'and' || name === 'or') {
      if (n.arguments.length === 1) {
        note(n, `op.${name} with one argument: the IR loses the ${name} wrapper`)
        return emit(n.arguments[0])
      }
      if (valuePosition(n))
        note(
          n,
          `value-position op.${name} has no TypeScript spelling with the same IR (%cond replaces ${name}); review its lock entry`,
          true,
        )
      return n.arguments.map((a: Node) => operand(a, RANK[name])).join(name === 'and' ? ' && ' : ' || ')
    }
    if (name === 'not') return `!${operand(n.arguments[0], RANK.unary)}`
    if (uiIf(n)) {
      const [c, a, b] = n.arguments
      const yes = branch(a)
      const no = branch(b)
      if (no.empty && yes.empty) return 'null'
      if (no.empty) return `${operand(c, RANK.and)} && ${yes.text}`
      return `${operand(c, RANK.or)} ? ${yes.text} : ${no.text}`
    }
    if (assignFn(n)) {
      const params = source.slice(n.start, n.body.start)
      const stmts = n.body.elements.map((e: Node) => {
        const [t, v, w] = e.arguments
        const target = emit(t)
        const op = opCall(e)
        if (op === 'set') return `${target} = ${emit(v)}`
        if (op === 'append') return `${target}.push(${emit(v)})`
        if (op === 'inc') return `${target} += ${emit(v)}`
        if (v.type === 'Literal' && v.value === null)
          return `${target} = ${target}.filter((item) => item !== ${emit(w)})`
        return `${target} = ${target}.filter((item) => item.${v.value} !== ${emit(w)})`
      })
      const outer = indentAt(source, n.start)
      return `${params}{\n${stmts.map((x: string) => `${outer}${style.indent}${x}`).join('\n')}\n${outer}}`
    }
    return splice(n)
  }
  function splice(n: Node): string {
    const edits: Edit[] = []
    const collect = (x: Node) => {
      for (const c of children(x)) {
        if (rewrites(c)) edits.push([c.start, c.end, emit(c)])
        else collect(c)
      }
    }
    collect(n)
    let text = source.slice(n.start, n.end)
    for (const [s, e, t] of edits.sort((a, b) => b[0] - a[0]))
      text = text.slice(0, s - n.start) + t + text.slice(e - n.start)
    return text
  }

  let code = source.slice(0, program.start) + splice(program) + source.slice(program.end)
  if (code === source) return { code, notes }
  notes.unshift({
    file,
    line: 1,
    rule: 'op',
    message: `op.* and motion-less ui.if → TypeScript operators (${sites} ${sites === 1 ? 'site' : 'sites'})`,
    see: 'views',
  })
  if (opName) {
    const body = code.replace(/^import[^\n]*\n/gm, '')
    if (new RegExp(`\\b${opName}\\.`).test(body))
      note(program, 'op.* is left after the rewrite: rewrite it by hand')
    else {
      const after = parse(code)
      const decl = after.body.find(
        (x: Node) =>
          x.type === 'ImportDeclaration' &&
          x.source.value === '@hozu/core' &&
          x.specifiers.some((y: Node) => y.local.name === opName),
      )
      const e = decl && filterImport(code, decl, (local) => local !== opName)
      if (e) code = apply(code, [e])
    }
  }
  return { code, notes }
}
