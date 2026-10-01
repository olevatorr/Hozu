import type { ComponentLoad } from '../ir/types.ts'
import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Ref, Val } from '../model/expr.ts'
import type { Infer, InferInput, Schema } from '../schema/standard.ts'
import type { Child, NodeDecl, Send, Tag } from './ui.ts'

export type { ComponentLoad }

/** The part of a tailwind-variants `tv()` result Hozu reads; the real one satisfies it. */
export interface TvStyles {
  (props?: any): unknown
  readonly variants?: object | undefined
  readonly defaultVariants?: object | undefined
  readonly slots?: object | undefined
}

export type VariantProps<S> = S extends (...args: any) => any
  ? Omit<NonNullable<Parameters<S>[0]>, 'class' | 'className'>
  : Record<string, never>

type SlotClasses<S> = S extends { readonly slots?: infer T }
  ? [NonNullable<T>] extends [object]
    ? { readonly [K in Exclude<keyof NonNullable<T>, 'base'> & string]: string }
    : Record<string, never>
  : Record<string, never>

export interface ComponentTypes {
  variant: object
  props: object
  slots: string
  on: object
  children: boolean
  client: { props: unknown; emits: object }
}

export interface ComponentDecl<T extends ComponentTypes = any> extends Decl<'component'>, Typed<T> {}

export interface RenderScope<P, Sl extends string, Ev extends string, Ch extends boolean, Cl> {
  props: Ref<P>
  slots: { readonly [K in Sl]: Child }
  children: Ch extends true ? Child[] : []
  on: { readonly [K in Ev]: Send }
  classes: Cl
}

export type ComponentUse<T extends ComponentTypes> = {
  variant?: T['variant']
  slots?: { [K in T['slots']]?: Child }
  on?: T['on']
  class?: string
} & (Record<never, never> extends T['props'] ? { props?: Val<T['props']> } : { props: Val<T['props']> })

export interface ComponentDef {
  tag: string
  styles: TvStyles | null
  props: Schema | null
  slots: readonly string[]
  children: boolean
  events: readonly string[]
  emits: Record<string, Schema>
  extend: boolean
  client: URL | null
  load: ComponentLoad | null
  render: (scope: any) => unknown
}

type PropsOf<P> = P extends Schema ? Infer<P> : Record<string, never>
type PropsIn<P> = P extends Schema ? InferInput<P> : Record<string, never>
type EmitsOn<Em> = { [K in keyof Em]?: (detail: Ref<Infer<Em[K]>>) => Send }

type Declared<S, P, Sl extends string, Ev extends string, Em, Ch extends boolean> = ComponentDecl<{
  variant: [S] extends [TvStyles] ? VariantProps<S> : Record<string, never>
  props: PropsIn<P>
  slots: Sl
  on: { [K in Ev]?: Send } & EmitsOn<Em>
  children: Ch
  client: { props: PropsOf<P>; emits: { [K in keyof Em]: Infer<Em[K]> } }
}>

interface ComponentConfig<S, P, Sl extends string, Ev extends string, Ch extends boolean> {
  tag: Tag
  styles?: S
  props?: P
  slots?: readonly Sl[]
  children?: Ch
  events?: readonly Ev[]
  extend?: boolean
  render: (scope: RenderScope<PropsOf<P>, Sl, Ev, Ch, SlotClasses<S>>) => NodeDecl
}

export function component<
  S extends TvStyles | undefined = undefined,
  P extends Schema | undefined = undefined,
  Sl extends string = never,
  Ev extends string = never,
  Ch extends boolean = false,
>(
  config: ComponentConfig<S, P, Sl, Ev, Ch> & { client?: never; load?: never; emits?: never },
): Declared<S, P, Sl, Ev, Record<never, never>, Ch>
export function component<
  S extends TvStyles | undefined = undefined,
  P extends Schema | undefined = undefined,
  Sl extends string = never,
  Ev extends string = never,
  Ch extends boolean = false,
  Em extends Record<string, Schema> = Record<never, never>,
>(
  config: ComponentConfig<S, P, Sl, Ev, Ch> & { client: URL; load: ComponentLoad; emits?: Em },
): Declared<S, P, Sl, Ev, Em, Ch>
export function component(config: {
  tag: string
  styles?: TvStyles
  props?: Schema
  slots?: readonly string[]
  children?: boolean
  events?: readonly string[]
  emits?: Record<string, Schema>
  extend?: boolean
  client?: URL
  load?: ComponentLoad
  render: (scope: any) => unknown
}): ComponentDecl {
  return brand({}, 'component', {
    tag: config.tag,
    styles: config.styles ?? null,
    props: config.props ?? null,
    slots: config.slots ?? [],
    children: config.children ?? false,
    events: config.events ?? [],
    emits: config.emits ?? {},
    extend: config.extend ?? true,
    client: config.client ?? null,
    load: config.load ?? null,
    render: config.render,
  } satisfies ComponentDef)
}

export interface KitDef {
  id: string
  components: readonly object[]
  styles: URL | null
}

export interface KitDecl extends Decl<'kit'> {
  readonly id: string
}

export const kit = (config: { id: string; components: readonly object[]; styles?: URL }): KitDecl =>
  brand({ id: config.id }, 'kit', {
    id: config.id,
    components: config.components,
    styles: config.styles ?? null,
  } satisfies KitDef)
