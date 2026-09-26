import type { SourceLoc } from '../ir/diagnostic.ts'
import { captureSource } from '../source/capture.ts'

export const DECL = Symbol.for('tenon.decl')

export type DeclKind =
  | 'event'
  | 'query'
  | 'mutation'
  | 'fn'
  | 'tag'
  | 'route'
  | 'machine'
  | 'view'
  | 'node'
  | 'on'
  | 'invoke'
  | 'contract'
  | 'feature'
  | 'project'
  | 'page'
  | 'adapter'
  | 'widget'
  | 'messages'

export interface DeclInfo<K extends DeclKind = DeclKind, D = unknown> {
  readonly kind: K
  readonly def: D
  readonly source: SourceLoc | null
}

export interface Decl<K extends DeclKind = DeclKind> {
  readonly [DECL]: DeclInfo<K>
}

declare const PHANTOM: unique symbol

export interface Typed<T> {
  readonly [PHANTOM]?: T
}

const transient = new Set<DeclKind>(['on', 'invoke', 'node'])

export function brand<T extends object, K extends DeclKind>(target: T, kind: K, def: unknown): T & Decl<K> {
  Object.defineProperty(target, DECL, { value: { kind, def, source: captureSource() } })
  return (transient.has(kind) ? target : Object.freeze(target)) as T & Decl<K>
}

export function infoOf(value: unknown): DeclInfo | null {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return null
  return ((value as Partial<Decl>)[DECL] as DeclInfo | undefined) ?? null
}

export function defOf<D>(value: Decl): D {
  return value[DECL].def as D
}
