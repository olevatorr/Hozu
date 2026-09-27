import type { CompareOp } from '../ir/types.ts'
import {
  ASSIGN,
  type Assign,
  type Call,
  type Expr,
  GUARD,
  type Guard,
  type Ref,
  type Val,
} from '../model/expr.ts'

type Comparable = number | string | boolean | null
type Condition = Guard | Call<boolean> | boolean

const guard = (raw: Guard[typeof GUARD]): Guard => Object.freeze({ [GUARD]: raw })
const assign = (raw: Assign[typeof ASSIGN]): Assign => Object.freeze({ [ASSIGN]: raw })
const compare =
  (op: CompareOp) =>
  <T extends Comparable>(left: Val<T>, right: NoInfer<Val<T>>): Guard =>
    guard({ op, left, right })

export const op = Object.freeze({
  set: <T>(target: Ref<T>, value: NoInfer<Val<T> | Val<NonNullable<T> | null>>): Assign =>
    assign({ op: 'set', target, value }),
  append: <T>(target: Ref<T[]>, value: NoInfer<Val<T>>): Assign => assign({ op: 'append', target, value }),
  inc: (target: Ref<number>, by: Val<number>): Assign => assign({ op: 'inc', target, value: by }),
  removeWhere: <T, K extends keyof T & string>(target: Ref<T[]>, key: K, value: NoInfer<Val<T[K]>>): Assign =>
    assign({ op: 'removeWhere', target, key, value }),
  eq: compare('eq'),
  neq: compare('neq'),
  lt: compare('lt') as (left: Val<number | null>, right: Val<number | null>) => Guard,
  lte: compare('lte') as (left: Val<number | null>, right: Val<number | null>) => Guard,
  gt: compare('gt') as (left: Val<number | null>, right: Val<number | null>) => Guard,
  gte: compare('gte') as (left: Val<number | null>, right: Val<number | null>) => Guard,
  and: (...args: Condition[]): Guard => guard({ op: 'and', args }),
  or: (...args: Condition[]): Guard => guard({ op: 'or', args }),
  not: (arg: Condition): Guard => guard({ op: 'not', arg }),
})

export type { Condition, Expr }
