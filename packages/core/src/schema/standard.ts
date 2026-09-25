export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => unknown
    readonly types?: { readonly input: Input; readonly output: Output } | undefined
  }
}

export type Schema<T = unknown> = StandardSchemaV1<any, T>

export type Infer<S> = S extends StandardSchemaV1<any, infer O> ? O : never

export const isStandardSchema = (value: unknown): value is StandardSchemaV1 =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof (value as Partial<StandardSchemaV1>)['~standard']?.vendor === 'string'
