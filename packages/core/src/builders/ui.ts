import {
  type htmlGlobalAttrs,
  htmlTags,
  type svgGlobalAttrs,
  svgTags,
  type tagAttrs,
  voidTags,
} from '../ir/dom-data.ts'
import type { DomEvent, DomFields } from '../ir/events.ts'
import { brand, type Decl } from '../model/decl.ts'
import { createRef, type Expr, type Guard, type Ref, refProxy, type Val } from '../model/expr.ts'
import type { Infer, Schema } from '../schema/standard.ts'
import { type Asset, asset } from './asset.ts'
import type { TagProps } from './dom-props.ts'
import type { QueryDecl } from './effects.ts'
import type { EventDecl } from './event.ts'
import { alternate, format, messages, openGraph } from './i18n.ts'
import type { MachineDecl, UnexpectedError } from './machine.ts'
import type { Condition } from './op.ts'
import { page } from './page.ts'
import type { RouteDecl } from './route.ts'
import { type WidgetDecl, widget } from './widget.ts'

export const SEND = Symbol.for('tenon.send')
export const LINK = Symbol.for('tenon.link')

declare const HREF: unique symbol

export interface Href extends Expr<string> {
  readonly [HREF]: true
}

type SearchArg<S> = [S] extends [null] ? [] : [search: NoInfer<Val<Partial<S>>> | null]

export const linkOf = (value: unknown): { route: unknown; params: unknown; search: unknown } | null =>
  typeof value === 'object' && value !== null ? ((value as Record<symbol, never>)[LINK] ?? null) : null

export type HtmlTag = (typeof htmlTags)[number]
export type SvgTag = (typeof svgTags)[number]
export type Tag = HtmlTag | SvgTag
type VoidTag = (typeof voidTags)[number]
type GlobalAttr<T extends Tag> = T extends SvgTag
  ? (typeof svgGlobalAttrs)[number]
  : (typeof htmlGlobalAttrs)[number]
export type HtmlAttr<T extends Tag = Tag> = (typeof tagAttrs)[T][number] | GlobalAttr<T>

export interface Send {
  readonly [SEND]: { event: EventDecl; payload: unknown }
}

export interface NodeDecl extends Decl<'node'> {}

export type Child = NodeDecl | string | number | Expr<string | number | null>

export type AttrValue = Val<string | number | boolean | null> | Guard | Asset

export type Props<T extends Tag = Tag> = TagProps[T] & {
  class?: string
  toggle?: Record<string, Guard | Val<boolean>>
  vars?: Record<`--${string}`, Val<string | number | null>>
  on?: { [E in DomEvent]?: Send }
  [data: `data-${string}`]: AttrValue | undefined
  [aria: `aria-${string}`]: AttrValue | undefined
}

export type NodeDef =
  | { kind: 'el'; tag: string; props: Record<string, unknown>; children: readonly unknown[] }
  | { kind: 'when'; states: readonly string[]; children: readonly unknown[]; motion: unknown }
  | { kind: 'each'; source: unknown; key: string | null; item: (item: any) => unknown; motion: unknown }
  | {
      kind: 'query'
      query: QueryDecl
      input: unknown
      ready: (data: any) => unknown
      pending: unknown
      failed: Record<string, (error: any) => unknown>
    }
  | { kind: 'embed'; view: ViewDecl }
  | { kind: 'if'; test: unknown; ifTrue: readonly unknown[]; ifFalse: readonly unknown[]; motion: unknown }
  | { kind: 'html'; value: unknown }
  | { kind: 'global'; target: 'window' | 'document'; on: Record<string, unknown> }
  | { kind: 'widget'; widget: WidgetDecl; options: WidgetUse<any, any>; children: readonly unknown[] }

export interface WidgetUse<P, E> {
  props: Val<P>
  on: { [K in keyof E]?: (detail: Ref<E[K]>) => Send }
  class?: string
  toggle?: Record<string, Guard | Val<boolean>>
  vars?: Record<`--${string}`, Val<string | number | null>>
}

export interface ViewDef {
  machine: MachineDecl | null
  route: RouteDecl | null
  render: (scope: any) => unknown
}

export interface ViewDecl extends Decl<'view'> {}

export type When<S extends string> = (states: S[], children: Child[], motion?: string) => NodeDecl

export interface ViewScope<C, S extends string, P, Q = null> {
  ctx: Ref<C>
  when: When<S>
  params: Ref<P>
  search: Ref<Q>
  locale: Ref<string>
}

const node = (def: NodeDef): NodeDecl => brand({}, 'node', def)

export const when = (states: readonly string[], children: readonly unknown[], motion?: string): NodeDecl =>
  node({ kind: 'when', states, children, motion: motion ?? null })

type Elements = {
  [T in Tag]: T extends VoidTag | 'textarea'
    ? (props: Props<T>) => NodeDecl
    : (props: Props<T>, children: Child[]) => NodeDecl
}

type QueryErrors<E> = {
  [K in keyof E | 'Unexpected']: (error: Ref<K extends keyof E ? E[K] : UnexpectedError>) => NodeDecl
}

function view<C, S extends string, P = null, Q = null>(config: {
  machine: MachineDecl<C, S>
  route?: RouteDecl<P, Q>
  render: (scope: ViewScope<C, S, P, Q>) => NodeDecl
}): ViewDecl
function view<P = null, Q = null>(config: {
  machine?: never
  route?: RouteDecl<P, Q>
  render: (scope: { params: Ref<P>; search: Ref<Q>; locale: Ref<string> }) => NodeDecl
}): ViewDecl
function view(config: Partial<ViewDef> & Pick<ViewDef, 'render'>): ViewDecl {
  return brand({}, 'view', {
    machine: config.machine ?? null,
    route: config.route ?? null,
    render: config.render,
  } satisfies ViewDef)
}

const voids = new Set<string>([...voidTags, 'textarea'])

const elements = Object.fromEntries(
  [...htmlTags, ...svgTags].map((tag) => [
    tag,
    voids.has(tag)
      ? (props: Record<string, unknown>) => node({ kind: 'el', tag, props, children: [] })
      : (props: Record<string, unknown>, children: Child[]) => node({ kind: 'el', tag, props, children }),
  ]),
) as Elements

export type DomText = Expr<never>
export type DomRef = Omit<Ref<DomFields>, 'form' | 'value'> & {
  value: DomText
  form: (name: string) => DomText
}

const domRoot = refProxy('dom', 0)
const form = (name: string): DomText => createRef('dom', 0, ['form', name])
const dom: DomRef = new Proxy(domRoot, { get: (t, k) => (k === 'form' ? form : Reflect.get(t, k)) })

export const ui = Object.freeze({
  ...elements,
  view,
  dom,
  send: <P>(event: EventDecl<P>, payload: NoInfer<Val<P>>): Send =>
    Object.freeze({ [SEND]: { event, payload } }),
  each: <T>(
    source: Expr<readonly T[]>,
    key: [T] extends [object] ? keyof T & string : null,
    item: (item: Ref<T>) => NodeDecl,
    motion?: string,
  ): NodeDecl => node({ kind: 'each', source, key, item, motion: motion ?? null }),
  query: <I, O, E>(
    query: QueryDecl<I, O, E>,
    input: NoInfer<Val<I>>,
    branches: { ready: (data: Ref<O>) => NodeDecl; pending: NodeDecl | null; failed: QueryErrors<E> },
  ): NodeDecl => node({ kind: 'query', query, input, ...branches }),
  embed: (view: ViewDecl): NodeDecl => node({ kind: 'embed', view }),
  widget,
  asset,
  if: (test: Condition, then: Child[], otherwise: Child[], motion?: string): NodeDecl =>
    node({ kind: 'if', test, ifTrue: then, ifFalse: otherwise, motion: motion ?? null }),
  html: (value: Val<string | null>): NodeDecl => node({ kind: 'html', value }),
  window: (options: { on: { [E in DomEvent]?: Send } }): NodeDecl =>
    node({ kind: 'global', target: 'window', on: options.on }),
  document: (options: { on: { [E in DomEvent]?: Send } }): NodeDecl =>
    node({ kind: 'global', target: 'document', on: options.on }),
  link: <P, S>(route: RouteDecl<P, S>, params: NoInfer<Val<P>>, ...search: SearchArg<S>): Href =>
    Object.freeze({ [LINK]: { route, params, search: search[0] ?? null } }) as unknown as Href,
  use: <P, E>(w: WidgetDecl<P, E>, options: NoInfer<WidgetUse<P, E>>, children: Child[]): NodeDecl =>
    node({ kind: 'widget', widget: w, options, children }),
  page,
  messages,
  format,
  alternate,
  og: openGraph,
  env: <S extends Schema>(_schema: S): Ref<Infer<S>> => refProxy('env', 0),
})

export const sendOf = (value: unknown): Send[typeof SEND] | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<Send>)[SEND] ?? null) : null
