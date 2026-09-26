import { brand, type Decl } from '../model/decl.ts'
import type { Val } from '../model/expr.ts'
import type { Infer, Schema } from '../schema/standard.ts'

export const TAG_USE = Symbol.for('hozu.tagUse')

export interface TagDef {
  param: Schema | null
}

export interface TagUse {
  readonly [TAG_USE]: { tag: object; param: unknown }
}

export interface TagDecl<P = unknown> extends Decl<'tag'> {
  (...param: [P] extends [null] ? [] : [Val<P>]): TagUse
}

export function tag<S extends Schema | null>(config: {
  param: S
}): TagDecl<S extends Schema ? Infer<S> : null> {
  const use = (...args: unknown[]): TagUse =>
    Object.freeze({ [TAG_USE]: { tag: use, param: args.length ? args[0] : null } })
  return brand(use, 'tag', { param: config.param } satisfies TagDef) as never
}

export const tagUseOf = (value: unknown): TagUse[typeof TAG_USE] | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<TagUse>)[TAG_USE] ?? null) : null
