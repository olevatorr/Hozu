import { planRoute } from '@hozu/compiler'
import {
  type BuildResult,
  componentOf,
  FORM_FIELD,
  formRunnable,
  type GuardExpr,
  type Json,
  type ProjectIR,
  type ValueExpr,
  type ViewNode,
  voidTags,
} from '@hozu/core/ir'
import { attrText, text } from '@hozu/runtime-client'
import { escapeHtml } from './escape.ts'
import { responsive, type Variants } from './images.ts'
import { bindingUses, type Shape, shapeOf } from './shape.ts'

export const SEP = '<!---->'
export const OPEN = '<!--[-->'
export const CLOSE = '<!--]-->'

const voids = new Set<string>(voidTags)
const q = (x: unknown) => JSON.stringify(x) ?? 'undefined'

export const renderKey = (route: string, node: string, island: boolean, sep: boolean) =>
  `${route}|${node}|${island ? 1 : 0}${sep ? 1 : 0}`

const staticAttr = (name: string, x: Json) => {
  const s = attrText(name, x)
  return s === null ? '' : s === '' ? ` ${name}` : ` ${name}="${escapeHtml(s)}"`
}

export const separated = (list: ViewNode[], i: number) => list[i + 1]?.kind === 'text'

interface Site {
  ir: ProjectIR
  route: string
  islands: Set<string>
  prepare: (root: ViewNode) => ViewNode
  consts: string[]
  pending: [ViewNode, boolean, boolean, number][]
  dev: boolean
}

/** A query the server never runs: it renders its `pending` branch (ADR 0049). */
function runsInBrowser(site: Site, query: string): boolean {
  const dot = query.indexOf('.')
  const runs = site.ir.features[query.slice(0, dot)]?.queries[query.slice(dot + 1)]?.runs
  return runs === 'browser' || runs === 'either'
}

function embeddedRoot(site: Site, view: string): ViewNode | null {
  const dot = view.indexOf('.')
  const root = site.ir.features[view.slice(0, dot)]?.views[view.slice(dot + 1)]?.root
  return root ? site.prepare(root) : null
}

function suspends(site: Site, n: ViewNode, seen = new Set<ViewNode>()): boolean {
  if (seen.has(n)) return false
  seen.add(n)
  switch (n.kind) {
    case 'query':
      return true
    case 'el':
    case 'when':
    case 'component':
      return n.children.some((c) => suspends(site, c, seen))
    case 'if':
      return [...n.ifTrue, ...n.ifFalse].some((c) => suspends(site, c, seen))
    case 'each':
      return suspends(site, n.item, seen)
    case 'embed': {
      const root = embeddedRoot(site, n.view)
      return root ? suspends(site, root, seen) : false
    }
    default:
      return false
  }
}

class Emitter {
  private lines: string[] = []
  private text = ''
  private loops = 0

  private site: Site
  private entry: number

  constructor(site: Site, entry: number) {
    this.site = site
    this.entry = entry
  }

  lit(s: string) {
    this.text += s
  }

  code(line: string) {
    this.flush()
    this.lines.push(line)
  }

  expr(js: string) {
    this.code(`out += ${js}`)
  }

  flush() {
    if (this.text) this.lines.push(`out += ${q(this.text)}`)
    this.text = ''
  }

  body() {
    this.flush()
    return this.lines.join('\n')
  }

  const(js: string) {
    this.site.consts.push(js)
    return `K${this.site.consts.length - 1}`
  }

  binding(depth: number) {
    return depth < this.entry ? `B[${depth}]` : `b${depth}`
  }

  value(v: ValueExpr): string {
    if ('literal' in v)
      return v.literal !== null && typeof v.literal === 'object' ? this.const(q(v.literal)) : q(v.literal)
    if ('object' in v)
      return `({${Object.entries(v.object)
        .map(([k, x]) => `${q(k)}: ${this.value(x)}`)
        .join(', ')}})`
    if ('fn' in v) return `h.call(f, ${q(v.fn)}, ${this.value(v.arg)})`
    if ('link' in v)
      return `h.pathOf(s.routes?.[${q(v.link)}] ?? '', ${this.value(v.params)}, ${this.value(v.search)})`
    if ('test' in v) return this.guard(v.test)
    if ('endpoint' in v)
      return `h.pathOf(s.routes?.[${q(v.endpoint)}] ?? '', null, ${v.input ? this.value(v.input) : 'null'})`
    if ('formRef' in v) return q(v.formRef)
    const path = this.const(q(v.path))
    if (v.ref === 'binding') {
      const b = this.binding(v.depth)
      return v.path.length ? `h.getIn(${b}, ${path})` : `(${b} ?? null)`
    }
    if (v.ref === 'dom') return 'null'
    return v.path.length ? `h.getIn(s[${q(v.ref)}], ${path})` : `(s[${q(v.ref)}] ?? null)`
  }

  guard(g: GuardExpr): string {
    switch (g.op) {
      case 'and':
        return g.args.length ? `(${g.args.map((a) => this.guard(a)).join(' && ')})` : 'true'
      case 'or':
        return g.args.length ? `(${g.args.map((a) => this.guard(a)).join(' || ')})` : 'false'
      case 'not':
        return `!${this.guard(g.arg)}`
      case 'fn':
        return `(h.call(f, ${q(g.fn)}, ${this.value(g.arg)}) === true)`
      default: {
        const l = this.value(g.left)
        const r = this.value(g.right)
        switch (g.op) {
          case 'eq':
            return `h.equal(${l}, ${r})`
          case 'neq':
            return `!h.equal(${l}, ${r})`
          case 'lt':
            return `(h.num(${l}) < h.num(${r}))`
          case 'lte':
            return `(h.num(${l}) <= h.num(${r}))`
          case 'gt':
            return `(h.num(${l}) > h.num(${r}))`
          default:
            return `(h.num(${l}) >= h.num(${r}))`
        }
      }
    }
  }

  classAndStyle(n: {
    class: string | null
    toggle: Record<string, ValueExpr>
    vars: Record<string, ValueExpr>
  }) {
    const toggles = Object.entries(n.toggle)
    if (toggles.length) {
      const active = toggles.map(([c, v]) => `${this.value(v)} === true ? ${q(c)} : null`).join(', ')
      this.expr(`h.classAttr(h.classText(${q(n.class)}, [${active}].filter((c) => c !== null)))`)
    } else if (n.class) this.lit(` class="${escapeHtml(n.class)}"`)
    const vars = Object.entries(n.vars)
    if (vars.length)
      this.expr(
        `h.styleAttr(h.styleText([${vars.map(([k, v]) => `[${q(k)}, ${this.value(v)}]`).join(', ')}]))`,
      )
  }

  wrap(island: boolean, inner: () => void) {
    if (island) this.lit(OPEN)
    inner()
    if (island) this.lit(CLOSE)
  }

  children(list: ViewNode[], island: boolean, depth: number) {
    list.forEach((c, i) => {
      this.node(c, island, separated(list, i), depth)
    })
  }

  island(n: ViewNode, depth: number) {
    const uses = bindingUses(n)
    const scope: string[] = []
    for (let i = 0; i < depth; i++) {
      const paths = uses.get(i)
      if (!paths) {
        scope.push('null')
        continue
      }
      const shape = shapeOf(paths)
      const b = this.binding(i)
      scope.push(shape === true ? `(${b} ?? null)` : `h.project(${b}, ${this.const(shapeJs(shape))})`)
    }
    this.expr(`r.island(${q(n.id)}, s, [${scope.join(', ')}])`)
  }

  node(n: ViewNode, island: boolean, sep: boolean, depth: number): void {
    const { site } = this
    if (!island && site.islands.has(n.id)) {
      this.island(n, depth)
      this.node(n, true, sep, depth)
      return
    }
    switch (n.kind) {
      case 'text': {
        const tail = island && sep ? SEP : ''
        if ('literal' in n.value) this.lit(escapeHtml(text(n.value.literal)) + tail)
        else {
          this.expr(`h.escapeHtml(h.text(${this.value(n.value)}))`)
          this.lit(tail)
        }
        return
      }
      case 'el': {
        this.lit(`<${n.tag}`)
        if (this.site.dev) this.lit(staticAttr('data-hz', n.id))
        this.classAndStyle(n)
        let content: ValueExpr | null = null
        for (const [name, v] of Object.entries(n.attrs)) {
          if (n.tag === 'textarea' && name === 'value') {
            content = v
            continue
          }
          if ('literal' in v) this.lit(staticAttr(name, v.literal))
          else this.expr(`h.attr(${q(name)}, ${this.value(v)})`)
        }
        const submit = n.tag === 'form' ? n.on.submit : undefined
        if (submit && !('method' in n.attrs) && formRunnable(submit.payload)) {
          const id = encodeURIComponent(n.id)
          this.lit(' method="post"')
          this.expr(
            `h.attr('action', s.url + (s.url.includes('?') ? '&' : '?') + ${q(`${FORM_FIELD}=${id}`)})`,
          )
        }
        this.lit('>')
        if (voids.has(n.tag)) return
        if (content !== null) {
          if ('literal' in content) this.lit(escapeHtml(text(content.literal)))
          else this.expr(`h.escapeHtml(h.text(${this.value(content)}))`)
        } else this.children(n.children, island, depth)
        this.lit(`</${n.tag}>`)
        return
      }
      case 'when':
        this.wrap(island, () => {
          this.code(`if (s.state !== null && ${this.const(q(n.states))}.includes(s.state)) {`)
          this.children(n.children, island, depth)
          this.code('}')
        })
        return
      case 'each':
        this.wrap(island, () => {
          const list = `l${this.loops++}`
          this.code(`const ${list} = ${this.value(n.source)}`)
          this.code(`if (Array.isArray(${list})) for (const b${depth} of ${list}) {`)
          this.node(n.item, island, true, depth + 1)
          this.code('}')
        })
        return
      case 'embed':
        this.wrap(island, () => {
          const root = embeddedRoot(site, n.view)
          if (!root) return
          site.pending.push([root, island, false, 0])
          this.code(`{ const e = r.embed(${q(n.view)})`)
          this.code(`if (e) out += R[${q(renderKey(site.route, root.id, island, false))}](e.scope, r, f) }`)
        })
        return
      case 'if':
        this.wrap(island, () => {
          this.code(`if (${this.guard(n.test)}) {`)
          this.children(n.ifTrue, island, depth)
          this.code('} else {')
          this.children(n.ifFalse, island, depth)
          this.code('}')
        })
        return
      case 'html':
        this.wrap(island, () => this.expr(`h.text(${this.value(n.value)})`))
        return
      case 'global':
        this.lit('<!--g-->')
        return
      case 'component': {
        const tag = componentOf(site.ir, n.use.component)?.tag ?? 'div'
        this.code(`r.component(${q(n.use.component)})`)
        this.lit(`<${tag}`)
        if (this.site.dev) this.lit(staticAttr('data-hz', n.id))
        this.classAndStyle(n)
        this.lit('>')
        const own = island && site.islands.has(n.id)
        n.children.forEach((c, i) => {
          this.node(c, !own && island, separated(n.children, i), depth)
        })
        this.lit(`</${tag}>`)
        return
      }
      default:
        return
    }
  }
}

function shapeJs(shape: Shape): string {
  if (shape === true) return 'true'
  return `[${[...shape].map(([k, s]) => `[${q(k)}, ${shapeJs(s)}]`).join(', ')}]`
}

function reachable(site: Site, add: (n: ViewNode, island: boolean, sep: boolean, depth: number) => void) {
  const walk = (n: ViewNode, island: boolean, sep: boolean, depth: number): void => {
    if (!suspends(site, n)) {
      add(n, island, sep, depth)
      return
    }
    if (!island && site.islands.has(n.id)) {
      walk(n, true, false, depth)
      return
    }
    switch (n.kind) {
      case 'el':
      case 'component': {
        const inner = n.kind === 'component' && site.islands.has(n.id) ? false : island
        n.children.forEach((c, i) => {
          walk(c, inner, separated(n.children, i), depth)
        })
        return
      }
      case 'if':
        for (const branch of [n.ifTrue, n.ifFalse])
          branch.forEach((c, i) => {
            walk(c, island, separated(branch, i), depth)
          })
        return
      case 'when':
        n.children.forEach((c, i) => {
          walk(c, island, separated(n.children, i), depth)
        })
        return
      case 'each':
        walk(n.item, island, true, depth + 1)
        return
      case 'embed': {
        const root = embeddedRoot(site, n.view)
        if (root) walk(root, island, false, 0)
        return
      }
      case 'query':
        walk(n.ready, island, false, depth + 1)
        for (const k in n.failed) walk(n.failed[k]!, island, false, depth + 1)
        if ((site.dev || runsInBrowser(site, n.query)) && n.pending) walk(n.pending, island, false, depth)
        return
      default:
        add(n, island, sep, depth)
    }
  }
  return walk
}

export function generateRender(build: BuildResult, images: Variants | null = null, dev = false): string {
  const { ir } = build
  const prepare = (root: ViewNode) => (images ? responsive(root, images) : root)
  const consts: string[] = []
  const fns: string[] = []
  for (const route of Object.keys(ir.pages)) {
    const { plan } = planRoute(ir, route)
    const site: Site = {
      ir,
      route,
      islands: new Set(plan.islands),
      prepare,
      consts,
      pending: [],
      dev,
    }
    const done = new Set<string>()
    const add = (n: ViewNode, island: boolean, sep: boolean, depth: number) => {
      const key = renderKey(route, n.id, island, sep)
      if (done.has(key)) return
      done.add(key)
      const e = new Emitter(site, depth)
      e.node(n, island, sep, depth)
      fns.push(
        `R[${q(key)}] = (s, r, f) => {\nconst B = s.bindings\nlet out = ''\n${e.body()}\nreturn out\n}`,
      )
    }
    const walk = reachable(site, add)
    for (const ref of plan.views) {
      const dot = ref.indexOf('.')
      const root = ir.features[ref.slice(0, dot)]?.views[ref.slice(dot + 1)]?.root
      if (root) walk(prepare(root), false, false, 0)
    }
    while (site.pending.length) {
      const [n, island, sep, depth] = site.pending.pop()!
      add(n, island, sep, depth)
    }
  }
  return [
    'export default function (h) {',
    ...consts.map((c, i) => `const K${i} = ${c}`),
    'const R = {}',
    ...fns,
    'return R',
    '}',
    '',
  ].join('\n')
}
