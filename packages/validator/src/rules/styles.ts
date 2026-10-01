import {
  type At,
  at,
  type ComponentIR,
  type GuardExpr,
  type JsonPatchOp,
  resolveAt,
  type ValueExpr,
  type ViewNode,
} from '@hozu/core/ir'
import type { ClassStyle, Ctx } from '../context.ts'
import { walkView } from '../walk.ts'

const tokens = (value: string | null | undefined) => (value ?? '').split(/\s+/).filter(Boolean)

export const classVariant = (c: string) => {
  let depth = 0
  let cut = -1
  for (let i = 0; i < c.length; i++) {
    if (c[i] === '[' || c[i] === '(') depth++
    else if (c[i] === ']' || c[i] === ')') depth--
    else if (c[i] === ':' && depth === 0) cut = i
  }
  return cut < 0 ? '' : c.slice(0, cut + 1)
}

const leading = (c: string) => c.slice(classVariant(c).length).startsWith('!')
export const important = (c: string) => c.endsWith('!') || leading(c)
const withoutBang = (c: string) =>
  c.endsWith('!') ? c.slice(0, -1) : leading(c) ? classVariant(c) + c.slice(classVariant(c).length + 1) : c
const trailingBang = (c: string) => `${withoutBang(c)}!`

const self = (key: string) => !key.includes(' ')
const MARGIN = /^margin(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/
const INHERITED = new Set([
  'color',
  'cursor',
  'direction',
  'font',
  'font-family',
  'font-feature-settings',
  'font-kerning',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-variant-caps',
  'font-variant-east-asian',
  'font-variant-ligatures',
  'font-variant-numeric',
  'font-variation-settings',
  'font-weight',
  'hyphens',
  'letter-spacing',
  'line-height',
  'list-style',
  'list-style-image',
  'list-style-position',
  'list-style-type',
  'overflow-wrap',
  'tab-size',
  'text-align',
  'text-align-last',
  'text-indent',
  'text-shadow',
  'text-transform',
  'text-wrap',
  'visibility',
  'white-space',
  'word-break',
  'word-spacing',
  '-webkit-font-smoothing',
  '-moz-osx-font-smoothing',
])

function sameProperties(a: ClassStyle, b: ClassStyle): string[] | null {
  if (a.variant !== b.variant || a.important !== b.important) return null
  const keys = Object.keys(a.properties)
  if (!keys.length || keys.length !== Object.keys(b.properties).length) return null
  if (!keys.every((k) => k in b.properties)) return null
  const differ = keys.filter((k) => a.properties[k] !== b.properties[k])
  return differ.length ? differ.sort() : null
}

const guardOf = (v: ValueExpr): GuardExpr =>
  'test' in v ? v.test : { op: 'fn', fn: '%truthy', arg: { object: { v } } }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** `c` / `!c`, `x === v` / `x !== v`, and `x === a` / `x === b` with different literals (ADR 0045 F). */
export function exclusive(x: ValueExpr, y: ValueExpr): boolean {
  const a = guardOf(x)
  const b = guardOf(y)
  if (a.op === 'not' && same(a.arg, b)) return true
  if (b.op === 'not' && same(b.arg, a)) return true
  if ((a.op !== 'eq' && a.op !== 'neq') || (b.op !== 'eq' && b.op !== 'neq')) return false
  if (a.op !== b.op)
    return (
      (same(a.left, b.left) && same(a.right, b.right)) || (same(a.left, b.right) && same(a.right, b.left))
    )
  if (a.op !== 'eq') return false
  const split = (g: { left: ValueExpr; right: ValueExpr }) =>
    'literal' in g.right ? [g.left, g.right] : 'literal' in g.left ? [g.right, g.left] : null
  const sa = split(a)
  const sb = split(b)
  return sa !== null && sb !== null && same(sa[0], sb[0]) && !same(sa[1], sb[1])
}

const complement = (v: ValueExpr): ValueExpr => {
  const g = guardOf(v)
  if (g.op === 'not') return 'test' in v ? { test: g.arg } : v
  if (g.op === 'eq' || g.op === 'neq') return { test: { ...g, op: g.op === 'eq' ? 'neq' : 'eq' } }
  return { test: { op: 'not', arg: g } }
}

type Styled = Extract<ViewNode, { kind: 'el' | 'widget' | 'component' }>
const styled = (n: ViewNode): n is Styled => n.kind === 'el' || n.kind === 'widget' || n.kind === 'component'

function eachStyled(ctx: Ctx, visit: (feature: string, node: Styled, pointer: At) => void) {
  for (const f of Object.values(ctx.ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ctx.ir, f, vid, view, ({ node, pointer }) => {
        if (styled(node)) visit(f.id, node, pointer)
      })
}

interface Item {
  cls: string
  key: string | null
}

export function classConflicts(ctx: Ctx) {
  const styles = ctx.classes
  if (!styles?.size) return
  eachStyled(ctx, (feature, node, pointer) => {
    const items: Item[] = [
      ...tokens(node.class).map((cls) => ({ cls, key: null })),
      ...Object.keys(node.toggle).flatMap((key) => tokens(key).map((cls) => ({ cls, key }))),
    ]
    const found: [Item, Item, string[]][] = []
    const moved = new Map<string, Set<string>>()
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!
        const b = items[j]!
        if ((a.key !== null && a.key === b.key) || a.cls === b.cls) continue
        const sa = styles.get(a.cls)
        const sb = styles.get(b.cls)
        const props = sa && sb ? sameProperties(sa, sb) : null
        if (!props) continue
        if (a.key !== null && b.key !== null && exclusive(node.toggle[a.key]!, node.toggle[b.key]!)) continue
        found.push([a, b, props])
        if ((a.key === null) !== (b.key === null)) {
          const [base, toggle] = a.key === null ? [a, b] : [b, a]
          const set = moved.get(toggle.key!) ?? new Set<string>()
          set.add(base.cls)
          moved.set(toggle.key!, set)
        }
      }
    for (const [a, b, props] of found) {
      const list = props.join(', ')
      if (a.key === null && b.key === null) {
        const [loser, winner] = styles.get(a.cls)!.order < styles.get(b.cls)!.order ? [a, b] : [b, a]
        const rest = tokens(node.class).filter((c) => c !== loser.cls)
        ctx.report(
          'HZ079',
          feature,
          at(pointer, 'class'),
          `Classes "${a.cls}" and "${b.cls}" both set ${list}; "${winner.cls}" always wins`,
          'Tailwind emits utilities that set the same properties in its own order, not in the order of class (ADR 0045 F), so one of them never applies.',
          {
            summary: `Remove "${loser.cls}", which never applies`,
            snippet: null,
            patch: [
              {
                op: 'replace',
                path: resolveAt(at(pointer, 'class')),
                value: rest.length ? rest.join(' ') : null,
              },
            ],
          },
        )
      } else if (a.key === null || b.key === null) {
        const [base, toggle] = a.key === null ? [a, b] : [b, a]
        const key = toggle.key!
        const bases = [...moved.get(key)!]
        const rest = tokens(node.class).filter((c) => !bases.includes(c))
        const target = bases.join(' ')
        const patch: JsonPatchOp[] = [
          {
            op: 'replace',
            path: resolveAt(at(pointer, 'class')),
            value: rest.length ? rest.join(' ') : null,
          },
          ...(target in node.toggle
            ? []
            : [
                {
                  op: 'add' as const,
                  path: resolveAt(at(pointer, 'toggle', target)),
                  value: complement(node.toggle[key]!) as never,
                },
              ]),
        ]
        ctx.report(
          'HZ079',
          feature,
          at(pointer, 'class'),
          `Class "${base.cls}" and toggle class "${toggle.cls}" both set ${list}`,
          `Tailwind emits utilities that set the same properties in its own order (ADR 0045 F), so "${styles.get(base.cls)!.order > styles.get(toggle.cls)!.order ? `${base.cls}" hides the toggle` : `${toggle.cls}" wins only by its name`}.`,
          {
            summary: `Move "${target}" into the complementary toggle`,
            snippet: `toggle: { '${key}': c, '${target}': !c }, or style the state through the attribute that announces it, e.g. aria-selected:${withoutBang(toggle.cls).slice(classVariant(toggle.cls).length)}`,
            patch: target in node.toggle ? null : patch,
          },
        )
      } else
        ctx.report(
          'HZ079',
          feature,
          at(pointer, 'toggle', a.key),
          `Toggle classes "${a.cls}" and "${b.cls}" both set ${list}, and their guards can hold together`,
          'Tailwind emits utilities that set the same properties in its own order (ADR 0045 F); only provably exclusive guards (c / !c, x === v / x !== v, x === a / x === b) may set the same property.',
          {
            summary: 'Make the guards exclusive, or style the state through its attribute',
            snippet: `toggle: { '${a.key}': x === 'a', '${b.key}': x === 'b' }`,
            patch: null,
          },
        )
    }
  })
}

const classPatch = (node: Styled, pointer: At, from: string, to: string): JsonPatchOp[] => [
  {
    op: 'replace',
    path: resolveAt(at(pointer, 'class')),
    value: tokens(node.class)
      .map((c) => (c === from ? to : c))
      .join(' '),
  },
]

export function leadingImportant(ctx: Ctx) {
  const fix = (c: string, patch: JsonPatchOp[] | null) => ({
    summary: `Write the important modifier last: "${trailingBang(c)}"`,
    snippet: patch ? null : `class: '${trailingBang(c)}'`,
    patch,
  })
  const report = (feature: string | null, p: At, c: string, patch: JsonPatchOp[] | null) =>
    ctx.report(
      'HZ074',
      feature,
      p,
      `"${c}" puts the important modifier first`,
      'Hozu spells the important modifier as a trailing ! (bg-red-500!); the leading form is Tailwind v3 syntax (ADR 0045 E).',
      fix(c, patch),
    )
  eachStyled(ctx, (feature, node, pointer) => {
    for (const c of tokens(node.class))
      if (leading(c)) report(feature, at(pointer, 'class'), c, classPatch(node, pointer, c, trailingBang(c)))
    for (const key of Object.keys(node.toggle))
      for (const c of tokens(key))
        if (leading(c)) {
          const fixed = tokens(key)
            .map((t) => (t === c ? trailingBang(t) : t))
            .join(' ')
          report(feature, at(pointer, 'toggle', key), c, [
            { op: 'add', path: resolveAt(at(pointer, 'toggle', fixed)), value: node.toggle[key]! as never },
            { op: 'remove', path: resolveAt(at(pointer, 'toggle', key)) },
          ])
        }
  })
  for (const [feature, owner, name, component, p] of components(ctx)) {
    component.owned.forEach((c, i) => {
      if (leading(c))
        report(feature, `${p}/owned/${i}`, c, [
          { op: 'replace', path: `${p}/owned/${i}`, value: trailingBang(c) },
        ])
    })
    for (const c of inner(ctx, `${owner}.${name}`)) if (leading(c)) report(feature, p, c, null)
  }
}

type Entry = [feature: string | null, owner: string, name: string, component: ComponentIR, pointer: string]

function components(ctx: Ctx): Entry[] {
  const out: Entry[] = []
  for (const [k, kit] of Object.entries(ctx.ir.kits))
    for (const [name, c] of Object.entries(kit.components))
      out.push([k, k, name, c, `/kits/${k}/components/${name}`])
  for (const f of Object.values(ctx.ir.features))
    for (const [name, c] of Object.entries(f.components))
      out.push([f.id, f.id, name, c, `/features/${f.id}/components/${name}`])
  return out
}

const inner = (ctx: Ctx, id: string) => ctx.components?.[id]?.inner ?? []

function componentOf(ctx: Ctx, id: string): ComponentIR | null {
  const [owner, name] = id.split('.') as [string, string]
  return ctx.ir.kits[owner]?.components[name] ?? ctx.ir.features[owner]?.components[name] ?? null
}

const VARIANT_SNIPPET = (name: string, c: string) =>
  `styles: tv({ variants: { tone: { custom: '${withoutBang(c)}' } } }), then ui.use(${name}, { variant: { tone: 'custom' } })`

export function componentStyles(ctx: Ctx) {
  const styles = ctx.classes
  const propsOf = (c: string) => Object.keys(styles?.get(c)?.properties ?? {})
  for (const [feature, owner, name, component, p] of components(ctx)) {
    const id = `${owner}.${name}`
    component.owned.forEach((c, i) => {
      if (important(c))
        ctx.report(
          'HZ073',
          feature,
          `${p}/owned/${i}`,
          `${id} uses the important class "${c}"`,
          'Only a call site may use !: two importants would compare by Tailwind order again (ADR 0045 E).',
          {
            summary: `Remove the ! from "${c}"; declare a variant for a different look`,
            snippet: VARIANT_SNIPPET(id, c),
            patch: [{ op: 'replace', path: `${p}/owned/${i}`, value: withoutBang(c) }],
          },
        )
      const margins = propsOf(c).filter((k) => self(k) && MARGIN.test(k))
      if (margins.length)
        ctx.report(
          'HZ076',
          feature,
          `${p}/owned/${i}`,
          `${id} sets its own outer margin with "${c}"`,
          `The root's margin (${margins.join(', ')}) is outer spacing, which belongs to the caller (ADR 0045 E).`,
          {
            summary: `Remove "${c}" from the component and set the spacing at the use`,
            snippet: `ui.use(${name}, { class: '${c}' })`,
            patch: [{ op: 'remove', path: `${p}/owned/${i}` }],
          },
        )
    })
    for (const c of inner(ctx, id))
      if (important(c))
        ctx.report(
          'HZ073',
          feature,
          p,
          `The render of ${id} uses the important class "${c}"`,
          'Only a call site may use !: two importants would compare by Tailwind order again (ADR 0045 E).',
          {
            summary: `Remove the ! from "${c}" in the render`,
            snippet: `class: '${withoutBang(c)}'`,
            patch: null,
          },
        )
  }
  eachStyled(ctx, (feature, node, pointer) => {
    const use = node.kind === 'el' ? node.use : undefined
    if (!use) return
    const component = componentOf(ctx, use.component)
    if (!component) return
    const owned = new Set(component.owned.flatMap(propsOf))
    const cp = at(pointer, 'class')
    for (const c of use.added) {
      const props = propsOf(c)
      const hits = props.filter((k) => owned.has(k))
      if (!component.extend || (hits.length && !important(c))) {
        ctx.report(
          'HZ072',
          feature,
          cp,
          component.extend
            ? `"${c}" sets ${hits.join(', ')}, which ${use.component} owns`
            : `${use.component} takes no caller classes, and "${c}" is one`,
          component.extend
            ? "A component owns every property its root's classes set, in every variant and state; a caller adds only classes that set none of them, or overrides one with a trailing ! (ADR 0045 E)."
            : 'The component is declared with extend: false, so a caller adds no class, ! included (ADR 0045 E).',
          {
            summary: component.extend
              ? `Declare a variant in ${use.component} for this look; for a one-off use, write "${trailingBang(c)}"`
              : `Declare a variant in ${use.component} for this look`,
            snippet: component.extend
              ? `${VARIANT_SNIPPET(use.component, c)}\nclass: '${trailingBang(c)}'`
              : VARIANT_SNIPPET(use.component, c),
            patch: null,
          },
        )
        continue
      }
      if (styles && props.length && !hits.length && important(c))
        ctx.report(
          'HZ077',
          feature,
          cp,
          `"${c}" overrides nothing: ${use.component} does not own ${props.join(', ')}`,
          'A trailing ! is needed only for a property the component owns (ADR 0045 E).',
          {
            summary: `Write "${withoutBang(c)}"`,
            snippet: null,
            patch: classPatch(node, pointer, c, withoutBang(c)),
          },
        )
    }
    const shadows = new Set(
      inner(ctx, use.component).flatMap((c) =>
        styles?.get(c)?.variant === '' ? propsOf(c).filter((k) => self(k) && INHERITED.has(k)) : [],
      ),
    )
    for (const c of use.added) {
      const hit = propsOf(c).filter((k) => self(k) && shadows.has(k))
      if (hit.length)
        ctx.report(
          'HZ075',
          feature,
          cp,
          `"${c}" sets ${hit.join(', ')} on ${use.component}, but an element inside it sets ${hit.length === 1 ? 'it' : 'them'} too`,
          'An inherited property set on the root does not reach an element that sets its own value (ADR 0045 E).',
          {
            summary: `Declare a variant in ${use.component} that styles the inner element`,
            snippet: VARIANT_SNIPPET(use.component, c),
            patch: null,
          },
        )
    }
  })
}
