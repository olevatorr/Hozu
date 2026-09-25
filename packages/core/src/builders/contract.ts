import { brand, type Decl } from '../model/decl.ts'
import type { EffectDecl } from './effects.ts'
import type { EventDecl } from './event.ts'
import type { MachineDecl } from './machine.ts'

export type Step =
  | { send: EventDecl; payload: unknown }
  | { done: EffectDecl; result: unknown }
  | { failed: EffectDecl; error: string; data: unknown }
  | { elapse: number }

export interface EffectCall {
  effect: EffectDecl
  input: unknown
}

export interface ContractDef {
  machine: MachineDecl
  given: { state: string; context: unknown }
  when: Step[]
  expect: { state: string; context: unknown; effects: EffectCall[] | null }
}

export interface ContractDecl extends Decl<'contract'> {}

export const contract = <C, S extends string>(
  machine: MachineDecl<C, S>,
  spec: {
    given: { state: NoInfer<S>; context: NoInfer<C> }
    when: Step[]
    expect: { state: NoInfer<S>; context: NoInfer<C> | null; effects: EffectCall[] | null }
  },
): ContractDecl => brand({}, 'contract', { machine, ...spec } as ContractDef)
