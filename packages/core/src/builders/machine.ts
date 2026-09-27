import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Assign, Ref, Val } from '../model/expr.ts'
import type { Infer, Schema } from '../schema/standard.ts'
import type { EffectDecl } from './effects.ts'
import type { EventDecl } from './event.ts'
import type { Condition } from './op.ts'
import type { Href } from './ui.ts'

export interface UnexpectedError {
  message: string
}

export interface InvalidError<I = Record<string, unknown>> {
  message: string
  fields: { [K in keyof I & string]: string | null }
}

export interface TransitionConfig<T extends string, A> {
  target: T
  guard?: (arg: A) => Condition
  assign?: (arg: A) => Assign[]
  navigate?: (arg: A) => Href
}

export interface AfterConfig<T extends string> extends TransitionConfig<T, void> {
  ms: number
}

export interface OnDef {
  event: EventDecl
  transition: TransitionConfig<string, any>
}

export type Outcome<T extends string, A> = T | TransitionConfig<T, A> | readonly TransitionConfig<T, A>[]

export interface InvokeDef {
  effect: EffectDecl
  input: unknown
  done: Outcome<string, any>
  failed: Record<string, Outcome<string, any>>
}

export interface OnDecl<T extends string = string> extends Decl<'on'>, Typed<T> {}

export interface InvokeDecl<T extends string = string> extends Decl<'invoke'>, Typed<T> {}

export interface StateConfig<S extends string> {
  on?: OnDecl<S>[]
  ignore?: EventDecl<any>[]
  invoke?: InvokeDecl<S>
  after?: AfterConfig<S>[]
  final?: boolean
}

export interface MachineDef {
  context: Schema
  initialContext: unknown
  initial: string
  states: (scope: { ctx: any }) => Record<string, StateConfig<string>>
}

export interface MachineDecl<C = any, S extends string = string>
  extends Decl<'machine'>,
    Typed<{ context: C; states: S }> {}

type ErrorTransitions<E, T extends string, I = Record<string, unknown>> = {
  [K in keyof E | 'Unexpected']: Outcome<T, Ref<K extends keyof E ? E[K] : UnexpectedError>>
} & { Invalid?: Outcome<T, Ref<InvalidError<I>>> }

export const on = <P, const T extends string>(
  event: EventDecl<P>,
  transition: TransitionConfig<T, Ref<P>>,
): OnDecl<T> => brand({}, 'on', { event, transition } satisfies OnDef)

type TargetOf<L> = L extends string
  ? L
  : L extends { target: infer T extends string }
    ? T
    : L extends readonly { target: infer T extends string }[]
      ? T
      : never

type Known<T extends string> = string extends T ? never : T

export const invoke = <
  I,
  O,
  E,
  const D extends Outcome<string, Ref<O>>,
  const F extends ErrorTransitions<E, string, I>,
>(
  effect: EffectDecl<I, O, E>,
  config: { input: NoInfer<Val<I>>; done: D; failed: F },
): InvokeDecl<Known<TargetOf<D> | { [K in keyof F]: TargetOf<F[K]> }[keyof F]>> =>
  brand({}, 'invoke', { effect, ...config } as unknown as InvokeDef)

export const machine = <CS extends Schema, S extends string>(config: {
  context: CS
  initialContext: NoInfer<Infer<CS>>
  initial: NoInfer<S>
  states: (scope: { ctx: Ref<Infer<CS>> }) => { [K in S]: StateConfig<NoInfer<S>> }
}): MachineDecl<Infer<CS>, S> => brand({}, 'machine', { ...config } as MachineDef)
