import { basename } from 'node:path'
import {
  apply,
  declaration,
  type Edit,
  lineOf,
  type Node,
  type Note,
  parents,
  parse,
  type Rewrite,
  walk,
} from './migrate-ast.ts'

const WRITES = new Set(['set', 'push', 'unshift'])

const member = (n: Node, object: string | null, name: string) =>
  n?.type === 'CallExpression' &&
  n.callee.type === 'MemberExpression' &&
  !n.callee.computed &&
  n.callee.property.name === name &&
  (object === null || (n.callee.object.type === 'Identifier' && n.callee.object.name === object))

const sessionUser = (n: Node, session: string) =>
  n?.type === 'MemberExpression' &&
  !n.computed &&
  n.object.type === 'Identifier' &&
  n.object.name === session &&
  n.property.name === 'user'

/** The scaffold's `itemsOf`: `if (!s) return []; const list = store.get(s.user) ?? []; store.set(s.user, list); return list`. */
export function createOnRead(fn: Node): { store: string; session: string } | null {
  if (fn?.type !== 'ArrowFunctionExpression' || fn.params.length !== 1 || fn.body.type !== 'BlockStatement')
    return null
  const session = fn.params[0].type === 'Identifier' ? fn.params[0].name : null
  const [guard, get, set, ret, ...rest] = fn.body.body
  if (!session || rest.length || !ret) return null
  const empty = (s: Node) =>
    s?.type === 'ReturnStatement' && s.argument?.type === 'ArrayExpression' && !s.argument.elements.length
  if (
    guard.type !== 'IfStatement' ||
    guard.test.type !== 'UnaryExpression' ||
    guard.test.operator !== '!' ||
    guard.test.argument.name !== session ||
    !(
      empty(guard.consequent) ||
      (guard.consequent.type === 'BlockStatement' && empty(guard.consequent.body[0]))
    )
  )
    return null
  const decl = get.type === 'VariableDeclaration' ? get.declarations[0] : null
  const init = decl?.init
  if (
    !decl ||
    get.declarations.length !== 1 ||
    init?.type !== 'LogicalExpression' ||
    init.operator !== '??' ||
    init.right.type !== 'ArrayExpression' ||
    !member(init.left, null, 'get') ||
    init.left.callee.object.type !== 'Identifier' ||
    !sessionUser(init.left.arguments[0], session)
  )
    return null
  const store = init.left.callee.object.name as string
  const list = decl.id.name as string
  const write = set.type === 'ExpressionStatement' ? set.expression : null
  if (
    !member(write, store, 'set') ||
    !sessionUser(write.arguments[0], session) ||
    write.arguments[1]?.name !== list ||
    ret.type !== 'ReturnStatement' ||
    ret.argument?.name !== list
  )
    return null
  return { store, session }
}

const kindOf = (file: string, program: Node, ref: Node) => {
  const d = declaration(file, program, ref)
  return d?.init.type === 'CallExpression' && d.init.callee.type === 'Identifier' ? d.init.callee.name : null
}

interface Scope {
  file: string
  source: string
  functions: Map<string, Node>
  values: Map<string, Node>
  program: Node
}

interface Write {
  at: Node
  method: string
  via: string | null
  where: string | null
}

function scopeOf(file: string, program: Node, source: string): Scope {
  const functions = new Map<string, Node>()
  const values = new Map<string, Node>()
  walk(program, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id) functions.set(n.id.name, n)
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init)
      (/Function/.test(n.init.type) ? functions : values).set(n.id.name, n.init)
  })
  return { file, source, functions, values, program }
}

const where = (mod: Scope, n: Node) => `${basename(mod.file)}:${lineOf(mod.source, n.start)}`

const isFunction = (n: Node | undefined) => /Function/.test(n?.type ?? '')

const scopes = new WeakMap<Node, Scope>()

function imported(ref: Node, mod: Scope): { fn: Node; mod: Scope } | { value: Node; mod: Scope } | null {
  const d = declaration(mod.file, mod.program, ref)
  if (!d) return null
  if (!scopes.has(d.program)) scopes.set(d.program, scopeOf(d.file, d.program, d.source))
  const other = scopes.get(d.program)!
  return isFunction(d.init) ? { fn: d.init, mod: other } : { value: d.init, mod: other }
}

function functionOf(ref: Node, mod: Scope): { fn: Node; mod: Scope } | null {
  if (ref.type === 'Identifier' && mod.functions.has(ref.name))
    return { fn: mod.functions.get(ref.name)!, mod }
  const found = imported(ref, mod)
  return found && 'fn' in found ? found : null
}

function returned(fn: Node): Node | null {
  if (fn.body.type === 'ObjectExpression') return fn.body
  if (fn.body.type !== 'BlockStatement') return null
  const ret = fn.body.body.find((s: Node) => s.type === 'ReturnStatement')
  return ret?.argument?.type === 'ObjectExpression' ? ret.argument : null
}

function objectOf(value: Node, mod: Scope): { object: Node; mod: Scope } | null {
  if (value.type === 'ObjectExpression') return { object: value, mod }
  if (value.type !== 'CallExpression') return null
  const f = functionOf(value.callee, mod)
  const object = f && returned(f.fn)
  return object && f ? { object, mod: f.mod } : null
}

/** The function a call runs: a local or imported function, or a method of an object a factory returns. */
function callee(c: Node, mod: Scope): { fn: Node; mod: Scope } | null {
  if (c.type === 'Identifier') return functionOf(c, mod)
  if (c.type !== 'MemberExpression' || c.computed || c.object.type !== 'Identifier') return null
  const local = mod.values.get(c.object.name)
  const found = local ? { value: local, mod } : imported(c.object, mod)
  if (!found) return imported(c, mod) && functionOf(c, mod)
  if ('fn' in found) return null
  const owner = objectOf(found.value, found.mod)
  const p = owner?.object.properties.find(
    (x: Node) => x.type === 'Property' && (x.key.name ?? x.key.value) === c.property.name,
  )
  if (!owner || !p) return null
  if (isFunction(p.value)) return { fn: p.value, mod: owner.mod }
  return p.value.type === 'Identifier' ? functionOf(p.value, owner.mod) : null
}

/** Query resolvers only read (ADR 0043 B): split the scaffold's create-on-read helper, print other writes. */
export function migrateLists(source: string, file: string): Rewrite {
  if (!/\bimplement\s*\(/.test(source)) return { code: source, notes: [] }
  const program = parse(source)
  const parent = parents(program)
  const notes: Note[] = []
  const edits: Edit[] = []
  const helpers = new Map<string, Node>()
  walk(program, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && createOnRead(n.init))
      helpers.set(n.id.name, n)
  })
  const implementsOf = (n: Node): { kind: string | null; name: string } | null => {
    for (let up = parent.get(n); up; up = parent.get(up))
      if (up.type === 'CallExpression' && up.callee.type === 'Identifier' && up.callee.name === 'implement')
        return {
          kind: kindOf(file, program, up.arguments[0]),
          name: source.slice(up.arguments[0].start, up.arguments[0].end),
        }
    return null
  }
  const taken = new Set<string>()
  walk(program, (n) => n.type === 'Identifier' && taken.add(n.name))
  for (const [name, decl] of helpers) {
    const calls: { n: Node; query: boolean }[] = []
    walk(program, (n) => {
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === name)
        calls.push({ n, query: implementsOf(n)?.kind === 'query' })
    })
    const reads = calls.filter((c) => c.query).length
    if (!reads) continue
    const read = taken.has('listOf') ? `${name}Read` : 'listOf'
    const own = taken.has('ownListOf') ? `${name}Own` : 'ownListOf'
    const fn = decl.init
    const { store, session } = createOnRead(fn)!
    const head = source.slice(fn.start, fn.body.start).replace(/\s*=>\s*$/, '')
    const stmt = parent.get(decl)!
    const lineStart = source.lastIndexOf('\n', stmt.start) + 1
    const indent = source.slice(lineStart, stmt.start)
    edits.push([
      stmt.start,
      stmt.end,
      `const ${read} = ${head} => (${session} ? (${store}.get(${session}.user) ?? []) : [])\n${indent}const ${own} = ${source.slice(fn.start, fn.end)}`,
    ])
    for (const c of calls) edits.push([c.n.callee.start, c.n.callee.end, c.query ? read : own])
    notes.push({
      file,
      line: lineOf(source, stmt.start),
      rule: 'resolvers',
      message: `${name} created the user's list on read: split into ${read} (${reads} query ${reads === 1 ? 'call' : 'calls'}) and ${own} (writes)`,
      see: 'data',
    })
  }
  const here = scopeOf(file, program, source)
  const writes = (body: Node, mod: Scope, seen: Set<Node>): Write[] => {
    const out: Write[] = []
    walk(body, (x) => {
      if (x.type !== 'CallExpression') return
      const c = x.callee
      if (c.type === 'MemberExpression' && !c.computed && WRITES.has(c.property.name)) {
        out.push({ at: x, method: c.property.name, via: null, where: mod === here ? null : where(mod, x) })
        return
      }
      if (c.type === 'Identifier' && mod === here && helpers.has(c.name)) return
      const target = callee(c, mod)
      if (!target || seen.has(target.fn)) return
      seen.add(target.fn)
      const via = mod.source.slice(c.start, c.end)
      for (const w of writes(target.fn.body, target.mod, seen))
        out.push(mod === here ? { ...w, at: x, via } : w)
    })
    return out
  }
  walk(program, (n) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || n.callee.name !== 'implement') return
    if (kindOf(file, program, n.arguments[0]) !== 'query' || !n.arguments[1]) return
    const query = source.slice(n.arguments[0].start, n.arguments[0].end)
    const seen = new Set<string>()
    for (const w of writes(n.arguments[1], here, new Set())) {
      const key = `${w.via}.${w.method}`
      if (seen.has(key)) continue
      seen.add(key)
      notes.push({
        file,
        line: lineOf(source, w.at.start),
        rule: 'resolvers',
        message: `the resolver of query ${query} ${w.via ? `calls ${w.via}, which calls` : 'calls'} .${w.method}()${w.where ? ` (${w.where})` : ''}: query resolvers only read; move the write into a mutation`,
        see: 'data',
        behaviour: true,
      })
    }
  })
  return { code: apply(source, edits), notes }
}
