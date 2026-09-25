export type Check = (value: unknown) => string[] | null

export interface Bindings {
  fns: Record<string, (input: never) => unknown>
  checks: Record<string, Check>
  refs: Map<object, string>
  styles: StyleFiles
}

export interface StyleFiles {
  entry: string | null
  features: Record<string, string[]>
}
