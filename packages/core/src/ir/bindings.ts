import type { Parse } from '../schema/check.ts'

export type Check = (value: unknown) => string[] | null

export interface Bindings {
  fns: Record<string, (input: never) => unknown>
  fnHelpers: Record<string, Record<string, string>>
  checks: Record<string, Check>
  parses?: Record<string, Parse>
  refs: Map<object, string>
  styles: StyleFiles
  widgets: Record<string, string>
  assets: Record<string, { file: string | null; width: number | null; height: number | null }>
  assetOrder: { name: string; href: string; width: number | null; height: number | null }[]
  env: { server: Parse | null; public: Parse | null }
  /** Transition pointer of each `machine({ on })` copy → pointer of the entry it was copied from. */
  copies: Record<string, string>
  /** Class tokens of each component render's non-root elements, from the declaration-time render. */
  components: Record<string, { inner: string[] }>
}

export interface StyleFiles {
  entry: string | null
  kits: Record<string, string>
  features: Record<string, string[]>
}
