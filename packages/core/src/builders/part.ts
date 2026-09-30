import { brand, type Decl } from '../model/decl.ts'

export interface PartDecl<A extends unknown[] = any[], R = unknown> extends Decl<'part'> {
  (...args: A): R
}

type Inline = (part: PartDecl, out: unknown) => unknown

let inline: Inline | null = null

export const onInline = (hook: Inline | null): Inline | null => {
  const previous = inline
  inline = hook
  return previous
}

export function part<A extends unknown[], R>(body: (...args: A) => R): PartDecl<A, R> {
  const call = (...args: A): R => {
    if (!inline) return body(...args)
    return inline(self, body(...args)) as R
  }
  const self = brand(call, 'part', { body }) as PartDecl<A, R>
  return self
}
