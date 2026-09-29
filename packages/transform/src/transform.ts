import { stripTypeScriptTypes } from 'node:module'
import { parse } from 'acorn'

type Node = { type: string; start: number; end: number; [key: string]: any }

export interface TransformResult {
  code: string
  changed: boolean
}

const H = '__hozu'
const HEADER = `import { lower as ${H} } from '@hozu/core/lower';`
const BUILDERS = new Set(['machine', 'on', 'invoke', 'query', 'mutation', 'endpoint'])
const COMPARE: Record<string, string> = {
  '===': 'eq',
  '==': 'eq',
  '!==': 'neq',
  '!=': 'neq',
  '<': 'lt',
  '<=': 'lte',
  '>': 'gt',
  '>=': 'gte',
}

let quiet = false
function strip(source: string): string {
  if (!quiet) {
    quiet = true
    const emit = process.emitWarning
    process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
      if (String(warning).includes('stripTypeScriptTypes')) return
      ;(emit as (...a: unknown[]) => void).call(process, warning, ...rest)
    }) as typeof process.emitWarning
    try {
      return stripTypeScriptTypes(source, { mode: 'strip' })
    } finally {
      process.emitWarning = emit
    }
  }
  return stripTypeScriptTypes(source, { mode: 'strip' })
}

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && typeof (v as Node).type === 'string'

function children(node: Node): Node[] {
  const out: Node[] = []
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue
    const v = node[key]
    if (Array.isArray(v)) for (const x of v) if (isNode(x)) out.push(x)
    if (isNode(v)) out.push(v)
  }
  return out
}

const isFunction = (n: Node) =>
  n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration'

const keyName = (p: Node) =>
  p.key?.type === 'Identifier' ? p.key.name : p.key?.type === 'Literal' ? String(p.key.value) : null

function patternNames(p: Node | null, out: string[] = []): string[] {
  if (!p) return out
  if (p.type === 'Identifier') out.push(p.name)
  else if (p.type === 'ObjectPattern')
    for (const prop of p.properties)
      patternNames(prop.type === 'RestElement' ? prop.argument : prop.value, out)
  else if (p.type === 'ArrayPattern') for (const e of p.elements) patternNames(e, out)
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out)
  else if (p.type === 'RestElement') patternNames(p.argument, out)
  return out
}

const GLOBALS = new Set([
  'undefined',
  'NaN',
  'Infinity',
  'globalThis',
  'arguments',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'Math',
  'JSON',
  'Date',
  'RegExp',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'WeakRef',
  'Promise',
  'Reflect',
  'Proxy',
  'Intl',
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'AggregateError',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURIComponent',
  'decodeURIComponent',
  'encodeURI',
  'decodeURI',
  'structuredClone',
  'ArrayBuffer',
  'DataView',
  'Uint8Array',
  'Int8Array',
  'Uint16Array',
  'Int16Array',
  'Uint32Array',
  'Int32Array',
  'Float32Array',
  'Float64Array',
  'Uint8ClampedArray',
  'BigInt64Array',
  'BigUint64Array',
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
  'atob',
  'btoa',
  'console',
  'crypto',
])

function freeNames(root: Node): string[] {
  const declared = new Set<string>()
  const used = new Set<string>()
  const walk = (n: Node, skip = false) => {
    if (n.type === 'Identifier') {
      if (!skip) used.add(n.name)
      return
    }
    if (isFunction(n) || n.type === 'ClassDeclaration' || n.type === 'ClassExpression') {
      if (n.id) declared.add(n.id.name)
      if (n.params) for (const p of n.params) for (const name of patternNames(p)) declared.add(name)
    }
    if (n.type === 'VariableDeclarator') for (const name of patternNames(n.id)) declared.add(name)
    if (n.type === 'CatchClause') for (const name of patternNames(n.param)) declared.add(name)
    if (n.type === 'MetaProperty') return
    if (n.type === 'LabeledStatement' || n.type === 'BreakStatement' || n.type === 'ContinueStatement') {
      if (n.body) walk(n.body)
      return
    }
    for (const c of children(n)) {
      const key =
        (n.type === 'MemberExpression' && c === n.property && !n.computed) ||
        ((n.type === 'Property' || n.type === 'MethodDefinition' || n.type === 'PropertyDefinition') &&
          c === n.key &&
          !n.computed &&
          !(n.shorthand && c === n.value))
      walk(c, key)
    }
  }
  walk(root)
  return [...used].filter((name) => !declared.has(name) && !GLOBALS.has(name)).sort()
}

export function transform(source: string, _file = ''): TransformResult {
  if (!source.includes('@hozu/core') || source.startsWith(HEADER)) return { code: source, changed: false }
  const js = strip(source)
  const program = parse(js, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as Node
  const locals = new Map<string, string>()
  for (const stmt of program.body)
    if (stmt.type === 'ImportDeclaration' && stmt.source.value === '@hozu/core')
      for (const s of stmt.specifiers)
        if (s.type === 'ImportSpecifier') locals.set(s.local.name, s.imported.name ?? s.imported.value)
  if (!locals.size) return { code: source, changed: false }
  const moduleHelpers = new Map<string, Node>()
  for (const stmt of program.body) {
    const d = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt
    if (d?.type === 'FunctionDeclaration' && d.id) moduleHelpers.set(d.id.name, d)
    if (d?.type === 'VariableDeclaration' && d.kind === 'const')
      for (const v of d.declarations)
        if (v.id.type === 'Identifier' && v.init) moduleHelpers.set(v.id.name, v.init)
  }
  const helperClosure = (names: string[]) => {
    const helpers = new Set<string>()
    const free = new Set<string>()
    const visit = (name: string, trail: Set<string>) => {
      const node = moduleHelpers.get(name)
      const isFnCall =
        node?.type === 'CallExpression' && node.callee.type === 'Identifier' && fnNames.has(node.callee.name)
      if (!node || isFnCall || trail.has(name)) {
        if (!trail.has(name)) free.add(name)
        return
      }
      if (helpers.has(name)) return
      helpers.add(name)
      for (const inner of freeNames(node)) if (inner !== name) visit(inner, new Set([...trail, name]))
    }
    for (const n of names) visit(n, new Set())
    for (const n of free) helpers.delete(n)
    return { helpers: [...helpers].sort(), free: [...free].sort() }
  }
  const uiNames = new Set([...locals].filter(([, v]) => v === 'ui').map(([k]) => k))
  const builderNames = new Set([...locals].filter(([, v]) => BUILDERS.has(v)).map(([k]) => k))
  const fnNames = new Set([...locals].filter(([, v]) => v === 'fn').map(([k]) => k))

  const parent = new Map<Node, Node>()
  const link = (n: Node) => {
    for (const c of children(n)) {
      parent.set(c, n)
      link(c)
    }
  }
  link(program)

  const isUiMember = (callee: Node) =>
    callee?.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    uiNames.has(callee.object.name)
  const isBuilderCall = (call: Node) =>
    (call.callee.type === 'Identifier' && builderNames.has(call.callee.name)) || isUiMember(call.callee)

  const bearing = new Map<Node, boolean>()
  const refBearing = (fn: Node): boolean => {
    const known = bearing.get(fn)
    if (known !== undefined) return known
    let node = fn
    let result = false
    let viaImpl = false
    for (let up = parent.get(node); up; node = up, up = parent.get(up)) {
      if (up.type === 'Property' && up.value === node && keyName(up) === 'impl') viaImpl = true
      if (up.type === 'CallExpression') {
        if (up.callee === node) break
        if (up.callee.type === 'Identifier' && fnNames.has(up.callee.name)) break
        result = !viaImpl && isBuilderCall(up)
        break
      }
      if (isFunction(up)) {
        result = refBearing(up)
        break
      }
    }
    bearing.set(fn, result)
    return result
  }

  const edits: { start: number; end: number; text: string }[] = []
  const lowered = new Set<Node>()
  const gen = (n: Node): string => {
    let text = source.slice(n.start, n.end)
    const inside = edits.filter((e) => e.start >= n.start && e.end <= n.end).sort((a, b) => b.start - a.start)
    for (const e of inside) text = text.slice(0, e.start - n.start) + e.text + text.slice(e.end - n.start)
    return text
  }
  const replace = (n: Node, text: string, lower = true) => {
    const lines = (source.slice(n.start, n.end).match(/\n/g) ?? []).length - (text.match(/\n/g) ?? []).length
    const padded = lines > 0 ? text + '\n'.repeat(lines) : text
    for (let i = edits.length - 1; i >= 0; i--)
      if (edits[i]!.start >= n.start && edits[i]!.end <= n.end) edits.splice(i, 1)
    edits.push({ start: n.start, end: n.end, text: padded })
    if (lower) lowered.add(n)
  }

  type Scope = { names: Map<string, boolean>; up: Scope | null }
  const lookup = (s: Scope | null, name: string): boolean => {
    for (let x = s; x; x = x.up) if (x.names.has(name)) return x.names.get(name)!
    return false
  }
  const isRef = (n: Node, s: Scope): boolean => {
    if (lowered.has(n)) return true
    if (n.type === 'Identifier') return lookup(s, n.name)
    if (n.type === 'MemberExpression') return isRef(n.object, s)
    if (n.type === 'ChainExpression') return isRef(n.expression, s)
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && !builderNames.has(n.callee.name))
      return n.arguments.some((a: Node) => holdsRef(a, s))
    return false
  }
  const holdsRef = (n: Node, s: Scope): boolean =>
    isRef(n, s) ||
    (n.type === 'ObjectExpression' &&
      n.properties.some((p: Node) =>
        p.type === 'SpreadElement' ? holdsRef(p.argument, s) : holdsRef(p.value, s),
      )) ||
    (n.type === 'ArrayExpression' && n.elements.some((e: Node | null) => !!e && holdsRef(e, s)))
  const nodeLike = (n: Node | null): boolean =>
    !!n &&
    ((n.type === 'CallExpression' &&
      (isUiMember(n.callee) || (n.callee.type === 'Identifier' && n.callee.name === 'when'))) ||
      n.type === 'ArrayExpression' ||
      (n.type === 'ConditionalExpression' && (nodeLike(n.consequent) || nodeLike(n.alternate))))
  const childPosition = (n: Node): boolean => {
    const list = parent.get(n)
    const call = list && parent.get(list)
    return (
      list?.type === 'ArrayExpression' &&
      call?.type === 'CallExpression' &&
      call.arguments.indexOf(list) >= 1 &&
      (isUiMember(call.callee) || (call.callee.type === 'Identifier' && call.callee.name === 'when'))
    )
  }
  const inGuard = (fn: Node) => {
    const p = parent.get(fn)
    return p?.type === 'Property' && keyName(p) === 'guard'
  }

  const assignBody = (fn: Node, s: Scope) => {
    const body = fn.body
    const parts: string[] = []
    let cursor = body.start + 1
    for (const stmt of body.body) {
      const gap = (source.slice(cursor, stmt.start).match(/\n/g) ?? []).length
      const e = stmt.type === 'ExpressionStatement' ? stmt.expression : null
      let op: string | null = null
      if (e?.type === 'AssignmentExpression' && isRef(e.left, s)) {
        const filter =
          e.operator === '=' &&
          e.right.type === 'CallExpression' &&
          e.right.callee.type === 'MemberExpression' &&
          e.right.callee.property.name === 'filter' &&
          gen(e.right.callee.object) === gen(e.left) &&
          e.right.arguments[0] &&
          isFunction(e.right.arguments[0])
            ? e.right.arguments[0]
            : null
        const test = filter?.body
        if (
          test?.type === 'BinaryExpression' &&
          test.operator === '!==' &&
          test.left.type === 'MemberExpression' &&
          test.left.object.type === 'Identifier' &&
          test.left.object.name === filter.params[0]?.name
        )
          op = `${H}.removeWhere(${gen(e.left)}, ${JSON.stringify(test.left.property.name)}, ${gen(test.right)})`
        else if (e.operator === '=') op = `${H}.set(${gen(e.left)}, ${gen(e.right)})`
        else if (e.operator === '+=') op = `${H}.inc(${gen(e.left)}, ${gen(e.right)})`
        else if (e.operator === '-=') op = `${H}.inc(${gen(e.left)}, ${H}.minus(0, ${gen(e.right)}))`
      } else if (
        e?.type === 'CallExpression' &&
        e.callee.type === 'MemberExpression' &&
        e.callee.property.name === 'push' &&
        isRef(e.callee.object, s)
      )
        op = `${H}.append(${gen(e.callee.object)}, ${gen(e.arguments[0])})`
      if (op === null) return
      parts.push('\n'.repeat(gap) + op)
      cursor = stmt.end
    }
    replace(body, `[${parts.join(', ')}]`, false)
  }

  const visit = (n: Node, s: Scope, bool: boolean, guardFn = false) => {
    if (isFunction(n)) {
      const bears = refBearing(n)
      const scope: Scope = { names: new Map(), up: s }
      for (const p of n.params)
        for (const name of patternNames(p)) scope.names.set(name, bears && name !== 'when')
      const guard = bears && inGuard(n)
      if (n.body.type === 'BlockStatement') {
        for (const st of n.body.body) visit(st, scope, false, guard)
        const p = parent.get(n)
        if (bears && p?.type === 'Property' && keyName(p) === 'assign') assignBody(n, scope)
      } else visit(n.body, scope, guard, guard)
      return
    }
    if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) {
        if (d.init) visit(d.init, s, false, guardFn)
        const ref = !!d.init && isRef(d.init, s)
        for (const name of patternNames(d.id)) s.names.set(name, ref)
      }
      return
    }
    if (n.type === 'ReturnStatement') {
      if (n.argument) visit(n.argument, s, guardFn, guardFn)
      return
    }
    if (n.type === 'IfStatement' || n.type === 'WhileStatement') {
      visit(n.test, s, true, guardFn)
      if (isRef(n.test, s))
        replace(n.test, `${H}.statement(${JSON.stringify(n.type === 'IfStatement' ? 'if' : 'while')})`, false)
      for (const c of children(n)) if (c !== n.test) visit(c, s, false, guardFn)
      return
    }
    if (n.type === 'ConditionalExpression') {
      visit(n.test, s, true, guardFn)
      visit(n.consequent, s, bool, guardFn)
      visit(n.alternate, s, bool, guardFn)
      if (isRef(n.test, s))
        replace(
          n,
          nodeLike(n.consequent) || nodeLike(n.alternate) || childPosition(n)
            ? `${H}.branch(${gen(n.test)}, ${gen(n.consequent)}, ${gen(n.alternate)})`
            : `${H}.cond(${gen(n.test)}, ${gen(n.consequent)}, ${gen(n.alternate)})`,
        )
      return
    }
    if (n.type === 'LogicalExpression') {
      visit(n.left, s, bool || n.operator !== '??', guardFn)
      visit(n.right, s, bool, guardFn)
      if (!isRef(n.left, s) && !isRef(n.right, s)) return
      const [l, r] = [gen(n.left), gen(n.right)]
      if (n.operator === '??') replace(n, `${H}.coalesce(${l}, ${r})`)
      else if (n.operator === '&&' && !bool && (nodeLike(n.right) || childPosition(n)))
        replace(n, `${H}.branch(${l}, ${r}, null)`)
      else if (bool) replace(n, `${H}.${n.operator === '&&' ? 'and' : 'or'}(${l}, ${r})`)
      else replace(n, n.operator === '&&' ? `${H}.cond(${l}, ${r}, ${l})` : `${H}.cond(${l}, ${l}, ${r})`)
      return
    }
    if (n.type === 'UnaryExpression' && n.operator === '!') {
      visit(n.argument, s, true, guardFn)
      if (isRef(n.argument, s)) replace(n, `${H}.not(${gen(n.argument)})`)
      return
    }
    if (n.type === 'BinaryExpression') {
      visit(n.left, s, false, guardFn)
      visit(n.right, s, false, guardFn)
      if (!isRef(n.left, s) && !isRef(n.right, s)) return
      const name = COMPARE[n.operator] ?? (n.operator === '+' ? 'plus' : n.operator === '-' ? 'minus' : null)
      if (name) replace(n, `${H}.${name}(${gen(n.left)}, ${gen(n.right)})`)
      return
    }
    if (n.type === 'TemplateLiteral' && parent.get(n)?.type !== 'TaggedTemplateExpression') {
      for (const e of n.expressions) visit(e, s, false, guardFn)
      if (!n.expressions.some((e: Node) => isRef(e, s))) return
      const parts: string[] = []
      n.quasis.forEach((q: Node, i: number) => {
        if (q.value.cooked) parts.push(JSON.stringify(q.value.cooked))
        if (n.expressions[i]) parts.push(gen(n.expressions[i]))
      })
      replace(n, `${H}.concat(${parts.join(', ')})`)
      return
    }
    if (n.type === 'CallExpression') {
      for (const c of children(n)) visit(c, s, false, guardFn)
      const callee = n.callee.type === 'ChainExpression' ? n.callee.expression : n.callee
      const declares =
        (callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          uiNames.has(callee.object.name) &&
          callee.property.name === 'view') ||
        (callee.type === 'Identifier' && [...locals].some(([l, i]) => l === callee.name && i === 'machine'))
      if (declares) {
        replace(n, `${H}.done(${gen(n)})`, false)
        return
      }
      if (callee.type === 'Identifier' && fnNames.has(callee.name)) {
        const impl = n.arguments[0]?.properties?.find(
          (p: Node) => p.type === 'Property' && keyName(p) === 'impl',
        )?.value
        const { helpers, free } = helperClosure(impl && isFunction(impl) ? freeNames(impl) : [])
        let text = gen(n)
        if (helpers.length)
          text = `${H}.helpers(${text}, { ${helpers.map((h) => `${h}: () => ${h}`).join(', ')} })`
        if (free.length) text = `${H}.free(${text}, ${JSON.stringify(free)})`
        if (text !== gen(n)) replace(n, text, false)
        return
      }
      if (callee.type === 'MemberExpression' && !callee.computed && isRef(callee.object, s)) {
        const statement = parent.get(n)
        const pushInAssign = callee.property.name === 'push' && statement?.type === 'ExpressionStatement'
        if (!pushInAssign) replace(n, `${H}.method(${JSON.stringify(callee.property.name)})`, false)
      }
      return
    }
    for (const c of children(n)) visit(c, s, false, guardFn)
  }

  visit(program, { names: new Map(), up: null }, false)
  let code = source
  for (const e of edits.sort((a, b) => b.start - a.start))
    code = code.slice(0, e.start) + e.text + code.slice(e.end)
  return { code: HEADER + code, changed: true }
}
