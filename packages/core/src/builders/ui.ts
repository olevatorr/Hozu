import type { DomEvent } from '../ir/types.ts'
import { brand, type Decl } from '../model/decl.ts'
import type { Expr, Ref, Val } from '../model/expr.ts'
import type { QueryDecl } from './effects.ts'
import type { EventDecl } from './event.ts'
import type { MachineDecl, UnexpectedError } from './machine.ts'
import { page } from './page.ts'
import type { RouteDecl } from './route.ts'

export const SEND = Symbol.for('tenon.send')

export const htmlTags = [
  'a',
  'article',
  'aside',
  'button',
  'div',
  'em',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'header',
  'img',
  'label',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'small',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
] as const

export const htmlAttrs = [
  'alt',
  'aria-hidden',
  'aria-label',
  'aria-live',
  'colspan',
  'disabled',
  'for',
  'href',
  'id',
  'name',
  'role',
  'rowspan',
  'src',
  'title',
  'type',
] as const

export const domEvents = ['click', 'submit'] as const satisfies readonly DomEvent[]

export type HtmlTag = (typeof htmlTags)[number]
export type HtmlAttr = (typeof htmlAttrs)[number]

export interface Send {
  readonly [SEND]: { event: EventDecl; payload: unknown }
}

export interface NodeDecl extends Decl<'node'> {}

export type Child = NodeDecl | string | number | Expr<string | number | null>

export type Props = {
  class?: string
  on?: { [E in DomEvent]?: Send }
} & { [A in HtmlAttr]?: Val<string | number | boolean | null> }

export type NodeDef =
  | { kind: 'el'; tag: string; props: Props; children: readonly unknown[] }
  | { kind: 'when'; states: readonly string[]; children: readonly unknown[] }
  | { kind: 'each'; source: unknown; key: string; item: (item: any) => unknown }
  | {
      kind: 'query'
      query: QueryDecl
      input: unknown
      ready: (data: any) => unknown
      pending: unknown
      failed: Record<string, (error: any) => unknown>
    }
  | { kind: 'embed'; view: ViewDecl }

export interface ViewDef {
  machine: MachineDecl | null
  route: RouteDecl | null
  render: (scope: any) => unknown
}

export interface ViewDecl extends Decl<'view'> {}

export type When<S extends string> = (states: S[], children: Child[]) => NodeDecl

export interface ViewScope<C, S extends string, P> {
  ctx: Ref<C>
  when: When<S>
  params: Ref<P>
}

const node = (def: NodeDef): NodeDecl => brand({}, 'node', def)

export const when = (states: readonly string[], children: readonly unknown[]): NodeDecl =>
  node({ kind: 'when', states, children })

type Elements = { [T in HtmlTag]: (props: Props, children: Child[]) => NodeDecl }

type QueryErrors<E> = {
  [K in keyof E | 'Unexpected']: (error: Ref<K extends keyof E ? E[K] : UnexpectedError>) => NodeDecl
}

function view<C, S extends string, P = null>(config: {
  machine: MachineDecl<C, S>
  route: RouteDecl<P> | null
  render: (scope: ViewScope<C, S, P>) => NodeDecl
}): ViewDecl
function view<P = null>(config: {
  machine: null
  route: RouteDecl<P> | null
  render: (scope: { params: Ref<P> }) => NodeDecl
}): ViewDecl
function view(config: ViewDef): ViewDecl {
  return brand({}, 'view', {
    machine: config.machine,
    route: config.route,
    render: config.render,
  } satisfies ViewDef)
}

const elements = Object.fromEntries(
  htmlTags.map((tag) => [
    tag,
    (props: Props, children: Child[]) => node({ kind: 'el', tag, props, children }),
  ]),
) as Elements

export const ui = Object.freeze({
  ...elements,
  view,
  send: <P>(event: EventDecl<P>, payload: Val<P>): Send => Object.freeze({ [SEND]: { event, payload } }),
  each: <T>(source: Expr<readonly T[]>, key: keyof T & string, item: (item: Ref<T>) => NodeDecl): NodeDecl =>
    node({ kind: 'each', source, key, item }),
  query: <I, O, E>(
    query: QueryDecl<I, O, E>,
    input: Val<I>,
    branches: { ready: (data: Ref<O>) => NodeDecl; pending: NodeDecl | null; failed: QueryErrors<E> },
  ): NodeDecl => node({ kind: 'query', query, input, ...branches }),
  embed: (view: ViewDecl): NodeDecl => node({ kind: 'embed', view }),
  page,
})

export const sendOf = (value: unknown): Send[typeof SEND] | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<Send>)[SEND] ?? null) : null
