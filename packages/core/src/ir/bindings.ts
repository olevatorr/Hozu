export type Check = (value: unknown) => string[] | null

export interface Bindings {
  fns: Record<string, (input: never) => unknown>
  checks: Record<string, Check>
}
