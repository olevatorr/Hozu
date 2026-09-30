import type { Operator } from '../ir/operators.ts'
import type { Json } from '../ir/types.ts'

type Impl = (input: never) => Json

export const operatorFns: Record<string, Impl> & Partial<Record<Operator, Impl>> = {
  '%truthy': function truthy(input: { v: Json }): Json {
    return Boolean(input.v)
  },
  '%cond': function cond(input: { c: boolean; a: Json; b: Json }): Json {
    return input.c ? input.a : input.b
  },
  '%coalesce': function coalesce(input: { a: Json; b: Json }): Json {
    return input.a ?? input.b
  },
  '%concat': function concat(input: Record<string, Json>): Json {
    return Object.values(input)
      .map((x) => String(x))
      .join('')
  },
  '%length': function length(input: { v: string | Json[] }): Json {
    return input.v.length
  },
  '%plus': function plus(input: { a: never; b: never }): Json {
    return (input.a as number) + (input.b as number)
  },
  '%minus': function minus(input: { a: number; b: number }): Json {
    return input.a - input.b
  },
  '%includes': function includes(input: { l: string | Json[] | null; v: never }): Json {
    return input.l?.includes(input.v) ?? false
  },
}
