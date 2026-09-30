// Rewrites op.* and motion-less ui.if to TypeScript operators (ADR 0043 G7): node bench/migrate/op-to-ts.mjs <file>…
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire, stripTypeScriptTypes } from 'node:module'

const require = createRequire(new URL('../../packages/transform/package.json', import.meta.url))
const { parse } = require('acorn')

const COMPARE = { eq: '===', neq: '!==', lt: '<', lte: '<=', gt: '>', gte: '>=' }
const ASSIGN = new Set(['set', 'append', 'inc', 'removeWhere'])
const quiet = process.emitWarning
process.emitWarning = () => {}

const isNode = (v) => typeof v === 'object' && v !== null && typeof v.type === 'string'
const kids = (n) =>
  Object.entries(n)
    .filter(([k]) => k !== 'parent')
    .flatMap(([, v]) => (Array.isArray(v) ? v.filter(isNode) : isNode(v) ? [v] : []))

export function migrate(source, file = '') {
  const js = stripTypeScriptTypes(source, { mode: 'strip' })
  const program = parse(js, { ecmaVersion: 'latest', sourceType: 'module' })
  const report = []
  const line = (n) => source.slice(0, n.start).split('\n').length
  const parent = new Map()
  const link = (n) => {
    for (const c of kids(n)) {
      parent.set(c, n)
      link(c)
    }
  }
  link(program)
  let opName = null
  let uiName = null
  for (const stmt of program.body)
    if (stmt.type === 'ImportDeclaration' && stmt.source.value === '@hozu/core')
      for (const s of stmt.specifiers) {
        if (s.imported?.name === 'op') opName = s.local.name
        if (s.imported?.name === 'ui') uiName = s.local.name
      }
  const opCall = (n) =>
    n?.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    n.callee.object.type === 'Identifier' &&
    n.callee.object.name === opName &&
    !n.callee.computed
      ? n.callee.property.name
      : null
  const uiIf = (n) =>
    n?.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    n.callee.object.type === 'Identifier' &&
    n.callee.object.name === uiName &&
    n.callee.property.name === 'if' &&
    n.arguments.length === 3
  const rewrites = (n) => (opCall(n) && !ASSIGN.has(opCall(n))) || uiIf(n) || assignFn(n)
  const assignFn = (n) => {
    if (n?.type !== 'ArrowFunctionExpression') return false
    const p = parent.get(n)
    const body = n.body.type === 'ArrayExpression' ? n.body : null
    return (
      p?.type === 'Property' &&
      p.key?.name === 'assign' &&
      !!body &&
      body.elements.length > 0 &&
      body.elements.every((e) => ASSIGN.has(opCall(e)))
    )
  }

  const kind = (n) => {
    const name = opCall(n)
    if (name in COMPARE) return name === 'eq' || name === 'neq' ? 'eq' : 'rel'
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
    if (
      ['AssignmentExpression', 'ArrowFunctionExpression', 'SequenceExpression', 'YieldExpression'].includes(
        n.type,
      )
    )
      return 'low'
    return 'primary'
  }
  const rank = { low: 0, cond: 1, coalesce: 2, or: 3, and: 4, eq: 5, rel: 6, arith: 7, unary: 8, primary: 9 }
  const operand = (n, min) => {
    const text = emit(n)
    const k = kind(n)
    return rank[k] < min || (k === 'coalesce' && min >= rank.or) ? `(${text})` : text
  }
  const valuePosition = (n) => {
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
  const branch = (n) => {
    if (n.type !== 'ArrayExpression') return { text: emit(n), empty: false }
    if (n.elements.length === 0) return { text: 'null', empty: true }
    if (n.elements.length === 1 && n.elements[0].type !== 'SpreadElement')
      return { text: operand(n.elements[0], rank.cond + 1), empty: false }
    return { text: emit(n), empty: false }
  }

  function emit(n) {
    const name = opCall(n)
    if (name in COMPARE)
      return `${operand(n.arguments[0], rank.eq + 1)} ${COMPARE[name]} ${operand(n.arguments[1], rank.eq + 1)}`
    if (name === 'and' || name === 'or') {
      if (n.arguments.length === 1) {
        report.push(`${file}:${line(n)} op.${name} with one argument: the IR loses the ${name}[] wrapper`)
        return emit(n.arguments[0])
      }
      if (valuePosition(n))
        report.push(
          `${file}:${line(n)} value-position op.${name}: %cond replaces the ${name} guard in the IR`,
        )
      return n.arguments
        .map((a) => operand(a, rank[name] + (name === 'and' ? 0 : 0)))
        .join(name === 'and' ? ' && ' : ' || ')
    }
    if (name === 'not') return `!${operand(n.arguments[0], rank.unary)}`
    if (uiIf(n)) {
      const [c, a, b] = n.arguments
      const yes = branch(a)
      const no = branch(b)
      const test = operand(c, rank.or)
      if (no.empty && yes.empty) return 'null'
      if (no.empty) return `${operand(c, rank.and)} && ${yes.empty ? 'null' : yes.text}`
      return `${test} ? ${yes.text} : ${no.text}`
    }
    if (assignFn(n)) {
      const params = source.slice(n.start, n.body.start)
      const stmts = n.body.elements.map((e) => {
        const op = opCall(e)
        const [t, v, w] = e.arguments
        const target = emit(t)
        if (op === 'set') return `${target} = ${emit(v)}`
        if (op === 'append') return `${target}.push(${emit(v)})`
        if (op === 'inc') return `${target} += ${emit(v)}`
        return `${target} = ${target}.filter((item) => item.${JSON.parse(source.slice(v.start, v.end).replace(/'/g, '"'))} !== ${emit(w)})`
      })
      return `${params}{\n${stmts.join('\n')}\n}`
    }
    return splice(n)
  }
  function splice(n) {
    const edits = []
    const collect = (x) => {
      for (const c of kids(x)) {
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

  let code = splice(program)
  code = source.slice(0, program.start) + code + source.slice(program.end)
  for (const stmt of program.body)
    if (
      stmt.type === 'VariableDeclaration' ||
      stmt.type === 'FunctionDeclaration' ||
      stmt.type === 'ExportNamedDeclaration'
    ) {
      const text = source.slice(stmt.start, stmt.end)
      if (
        opName &&
        new RegExp(`\\b${opName}\\.`).test(text) &&
        !/\b(ui\.view|machine|on|invoke)\(/.test(text)
      )
        report.push(`${file}:${line(stmt)} op.* inside a module-level helper: make it a part()`)
    }
  if (opName) {
    const left = new RegExp(`\\b${opName}\\.`).test(code.replace(/^import[^\n]*\n/gm, ''))
    if (!left)
      code = code.replace(/import \{([^}]*)\} from '@hozu\/core'/, (all, names) => {
        const kept = names
          .split(',')
          .map((x) => x.trim())
          .filter((x) => x && x !== 'op' && x !== `op as ${opName}`)
        return `import { ${kept.join(', ')} } from '@hozu/core'`
      })
    else report.push(`${file}: op.* left after the rewrite`)
  }
  return { code, report }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const file of process.argv.slice(2)) {
    const source = readFileSync(file, 'utf8')
    const { code, report } = migrate(source, file)
    if (code !== source) writeFileSync(file, code)
    for (const r of report) console.log(r)
  }
  process.emitWarning = quiet
}
