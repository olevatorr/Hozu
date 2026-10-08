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
import { type ComponentDecl, type ComponentTypes, type ComponentUse, component, kit } from './component.ts'
import type { TagProps } from './dom-props.ts'
import type { QueryDecl } from './effects.ts'
import type { EndpointDecl } from './endpoint.ts'
import type { EventDecl } from './event.ts'
import { alternate, format, messages, openGraph, recorderFns } from './i18n.ts'
import type { MachineDecl, UnexpectedError } from './machine.ts'
import type { Condition } from './op.ts'
import { page } from './page.ts'
import type { RouteDecl } from './route.ts'

export const SEND = Symbol.for('hozu.send')
export const SET = Symbol.for('hozu.set')
export const LINK = Symbol.for('hozu.link')

declare const HREF: unique symbol

export interface Href extends Expr<string> {
  readonly [HREF]: true
}

type SearchPatch<S> = {
  [K in keyof S]-?: { readonly [P in K]-?: Val<S[P]> } & { readonly [P in keyof S]?: Val<S[P]> }
}[keyof S]

type SearchArg<S> = [S] extends [null] ? [] : [search?: NoInfer<SearchPatch<S> | Expr<Partial<S>>>]

interface Link {
  <P, S>(route: RouteDecl<P, S>, params: NoInfer<Val<P>>, ...search: SearchArg<S>): Href
  <I>(endpoint: EndpointDecl<I, any, any, 'GET'>, input: NoInfer<Val<I>>): Href
  (endpoint: EndpointDecl<any, any, any, 'POST'>): Href
}

export const linkOf = (value: unknown): { route: unknown; params: unknown; search: unknown } | null =>
  typeof value === 'object' && value !== null ? ((value as Record<symbol, never>)[LINK] ?? null) : null

export type HtmlTag = (typeof htmlTags)[number]
export type SvgTag = (typeof svgTags)[number]
export type Tag = HtmlTag | SvgTag
type VoidTag = (typeof voidTags)[number]
type ShapeTag = 'path' | 'line' | 'circle' | 'rect' | 'ellipse' | 'polygon' | 'polyline' | 'stop' | 'use'
type GlobalAttr<T extends Tag> = T extends SvgTag
  ? (typeof svgGlobalAttrs)[number]
  : (typeof htmlGlobalAttrs)[number]
export type HtmlAttr<T extends Tag = Tag> = (typeof tagAttrs)[T][number] | GlobalAttr<T>

export interface Send {
  readonly [SEND]: { event: EventDecl; payload: unknown; keys?: unknown }
}

/** A keyboard shortcut: `KeyboardEvent.key` with optional `Mod` (⌘ on Apple, Ctrl elsewhere), `Ctrl`, `Meta`, `Alt`, `Shift` (ADR 0072 B). */
export type Shortcut = string

export interface NodeDecl extends Decl<'node'> {}

export type Child =
  | NodeDecl
  | string
  | number
  | boolean
  | null
  | undefined
  | Expr<string | number | null>
  | readonly Child[]

/** What a query branch or an each item returns: one node, or `c ? a : [b, c]`. */
export type Branch = NodeDecl | readonly Child[]

export type AttrValue = Val<string | number | boolean | null> | Guard | Asset | undefined

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
  | { kind: 'component'; component: ComponentDecl; options: unknown; children: readonly unknown[] }

type Use = <T extends ComponentTypes>(
  component: ComponentDecl<T>,
  options: NoInfer<ComponentUse<T>>,
  ...children: T['children'] extends true ? [children: Child[]] : []
) => NodeDecl

export interface ViewDef {
  machine: MachineDecl | null
  route: RouteDecl | null
  seed: ((scope: any) => unknown) | null
  render: (scope: any) => unknown
}

export interface ViewDecl extends Decl<'view'> {}

export type When<S extends string> = (states: S[], children: Child[], motion?: string) => NodeDecl

export interface ViewScope<C, S extends string, P, Q = null> {
  ctx: Ref<C>
  when: When<S>
  is: (states: S[]) => boolean
  /** True on the pages of that route: a menu marks its section with `'aria-current': current(orders)` (ADR 0071 A1). */
  current: <R>(route: RouteDecl<R, any>, params?: Partial<NoInfer<Val<NonNullable<R>>>>) => boolean
  params: Ref<P>
  search: Ref<Q>
  locale: Ref<string>
}

const node = (def: NodeDef): NodeDecl => brand({}, 'node', def)

const use = ((component: ComponentDecl, options: unknown, children: Child[] = []): NodeDecl =>
  node({ kind: 'component', component, options, children })) as Use

export const ifNode = (test: unknown, then: readonly unknown[], otherwise: readonly unknown[]): NodeDecl =>
  node({ kind: 'if', test, ifTrue: then, ifFalse: otherwise, motion: null })

export const when = (states: readonly string[], children: readonly unknown[], motion?: string): NodeDecl =>
  node({ kind: 'when', states, children, motion: motion ?? null })
recorderFns.add(when)

type Elements = {
  [T in Tag]: T extends VoidTag | 'textarea'
    ? (props: Props<T>) => NodeDecl
    : T extends ShapeTag
      ? (props: Props<T>, children?: Child[]) => NodeDecl
      : (props: Props<T>, children: Child[]) => NodeDecl
}

/** `Forbidden` (access refused, ADR 0056 B) is optional: unhandled, it renders the Unexpected branch. */
type QueryErrors<E> = {
  [K in keyof E | 'Unexpected']: (error: Ref<K extends keyof E ? E[K] : UnexpectedError>) => Branch | null
} & { Forbidden?: (error: Ref<UnexpectedError>) => Branch | null }

function view<C, S extends string, P = null, Q = null>(config: {
  machine: MachineDecl<C, S>
  route?: RouteDecl<P, Q>
  /**
   * Starts the machine from the address and, with `query(decl, input)`, from server data (ADR 0069 B2): a checkout
   * prefilled from the member. A query that fails leaves its fields at initialContext.
   */
  seed?: (scope: {
    params: Ref<P>
    search: Ref<Q>
    query: <I, O>(decl: QueryDecl<I, O, any, any, any>, input: Val<I>) => Ref<O>
  }) => { [K in keyof C]?: Val<C[K]> }
  render: (scope: ViewScope<C, S, P, Q>) => NodeDecl
}): ViewDecl
function view<P = null, Q = null>(config: {
  machine?: never
  route?: RouteDecl<P, Q>
  render: (scope: {
    params: Ref<P>
    search: Ref<Q>
    current: <R>(route: RouteDecl<R, any>, params?: Partial<NoInfer<Val<NonNullable<R>>>>) => boolean
    locale: Ref<string>
  }) => NodeDecl
}): ViewDecl
function view(config: Partial<ViewDef> & Pick<ViewDef, 'render'>): ViewDecl {
  return brand({}, 'view', {
    machine: config.machine ?? null,
    route: config.route ?? null,
    seed: config.seed ?? null,
    render: config.render,
  } satisfies ViewDef)
}

const voids = new Set<string>([...voidTags, 'textarea'])

const elements = Object.fromEntries(
  [...htmlTags, ...svgTags].map((tag) => [
    tag,
    voids.has(tag)
      ? (props: Record<string, unknown>) => node({ kind: 'el', tag, props, children: [] })
      : (props: Record<string, unknown>, children: Child[] = []) =>
          node({ kind: 'el', tag, props, children }),
  ]),
) as Elements

export type DomText = Expr<never>
export type DomList = Expr<never[]>
export type DomRef = Omit<Ref<DomFields>, 'form' | 'formAll' | 'value'> & {
  value: DomText
  form: (name: string) => DomText
  formAll: (name: string) => DomList
}

export interface FormRef extends Decl<'formRef'> {}

const domRoot = refProxy('dom', 0)
const form = (name: string): DomText => createRef('dom', 0, ['form', name])
const formAll = (name: string): DomList => createRef('dom', 0, ['formAll', name])
const dom: DomRef = new Proxy(domRoot, {
  get: (t, k) => (k === 'form' ? form : k === 'formAll' ? formAll : Reflect.get(t, k)),
})

export const ui = Object.freeze({
  ...elements,
  view,
  dom,
  formRef: (): FormRef => brand({}, 'formRef', null),
  send: <P>(event: EventDecl<P>, payload: NoInfer<Val<P>>, options?: { keys: Shortcut[] }): Send =>
    Object.freeze({ [SEND]: options ? { event, payload, keys: options.keys } : { event, payload } }),
  /** Copies a value into a context field, the short form of an event and a shared `on` that stays (ADR 0067 H). */
  set: <T>(field: T, value: NoInfer<Val<T>>): Send =>
    Object.freeze({ [SET]: { field, value } }) as unknown as Send,
  each: <T>(
    source: Expr<readonly T[]> | readonly T[],
    key: [T] extends [object] ? keyof T & string : null,
    item: (item: Ref<T>) => Branch,
    motion?: string,
  ): NodeDecl => node({ kind: 'each', source, key, item, motion: motion ?? null }),
  query: <I, O, E>(
    query: QueryDecl<I, O, E>,
    input: NoInfer<Val<I>>,
    branches: { ready: (data: Ref<O>) => Branch | null; pending?: Branch | null; failed: QueryErrors<E> },
  ): NodeDecl => node({ kind: 'query', query, input, ...branches, pending: branches.pending ?? null }),
  embed: (view: ViewDecl): NodeDecl => node({ kind: 'embed', view }),
  asset,
  if: (test: Condition, then: Child[], otherwise: Child[], motion: string): NodeDecl =>
    node({ kind: 'if', test, ifTrue: then, ifFalse: otherwise, motion }),
  html: (value: Val<string | null>): NodeDecl => node({ kind: 'html', value }),
  window: (options: { on: { [E in DomEvent]?: Send } }): NodeDecl =>
    node({ kind: 'global', target: 'window', on: options.on }),
  document: (options: { on: { [E in DomEvent]?: Send } }): NodeDecl =>
    node({ kind: 'global', target: 'document', on: options.on }),
  link: ((route: unknown, params: unknown = null, ...search: unknown[]): Href =>
    Object.freeze({ [LINK]: { route, params, search: search[0] ?? null } }) as unknown as Href) as Link,
  use,
  component,
  kit,
  page,
  messages,
  format,
  alternate,
  og: openGraph,
  env: <S extends Schema>(_schema: S): Ref<Infer<S>> => refProxy('env', 0),
})

export const setOf = (value: unknown): { field: unknown; value: unknown } | null =>
  typeof value === 'object' && value !== null
    ? ((value as Record<symbol, { field: unknown; value: unknown } | undefined>)[SET] ?? null)
    : null

export const sendOf = (value: unknown): Send[typeof SEND] | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<Send>)[SEND] ?? null) : null
