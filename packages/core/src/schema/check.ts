import type { Check } from '../ir/bindings.ts'
import { isStandardSchema } from './standard.ts'

type Issue = { message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }

const segment = (p: PropertyKey | { key: PropertyKey }) => String(typeof p === 'object' ? p.key : p)

export function toCheck(schema: unknown): Check | null {
  if (!isStandardSchema(schema)) return null
  return (value) => {
    const result = schema['~standard'].validate(value) as { issues?: ReadonlyArray<Issue> } | Promise<unknown>
    if (result instanceof Promise) return ['Async schemas cannot be checked synchronously']
    if (!result.issues) return null
    return result.issues.map((i) => `${(i.path ?? []).map(segment).join('.') || '(root)'}: ${i.message}`)
  }
}
