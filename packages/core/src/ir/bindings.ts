export type Check = (value: unknown) => string[] | null

export interface Bindings {
  fns: Record<string, (input: never) => unknown>
  checks: Record<string, Check>
  refs: Map<object, string>
  styles: StyleFiles
  widgets: Record<string, string>
  assets: Record<string, { file: string | null; width: number | null; height: number | null }>
  assetOrder: { name: string; href: string; width: number | null; height: number | null }[]
}

export interface StyleFiles {
  entry: string | null
  features: Record<string, string[]>
}
