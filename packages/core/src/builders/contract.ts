import { brand, type Decl } from '../model/decl.ts'
import type { EffectDecl } from './effects.ts'
import type { EventDecl } from './event.ts'
import type { MachineDecl } from './machine.ts'

export type Step =
  | { send: EventDecl; payload: unknown }
  | { done: EffectDecl; result: unknown }
  | { failed: EffectDecl; error: string; data: unknown }
  | { elapse: number }

export type EffectCall = { effect: EffectDecl; input: unknown } | { navigate: string }

export interface ContractDef {
  machine: MachineDecl
  given: { state: string; context?: unknown }
  when: Step[]
  expect: { state: string; changes?: unknown; effects?: EffectCall[] }
}

type Changes<T> = [T] extends [readonly unknown[]]
  ? T
  : [T] extends [object]
    ? { readonly [K in keyof T]?: Changes<T[K]> }
    : T

export interface ContractDecl extends Decl<'contract'> {}

export const contract = <C, S extends string>(
  machine: MachineDecl<C, S>,
  spec: {
    given: { state: NoInfer<S>; context?: Changes<NoInfer<C>> }
    when: Step[]
    expect: { state: NoInfer<S>; changes?: Changes<NoInfer<C>>; effects?: EffectCall[] }
  },
): ContractDecl => brand({}, 'contract', { machine, ...spec } as ContractDef)
