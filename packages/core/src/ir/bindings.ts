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
}

export interface StyleFiles {
  entry: string | null
  features: Record<string, string[]>
}
