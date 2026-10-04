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

export type Parse = (value: unknown) => { ok: true; value: unknown } | { ok: false; issues: string[] }

export function toParse(schema: unknown): Parse | null {
  if (!isStandardSchema(schema)) return null
  return (value) => {
    const result = schema['~standard'].validate(value) as
      | { value?: unknown; issues?: ReadonlyArray<Issue> }
      | Promise<unknown>
    if (result instanceof Promise)
      return { ok: false, issues: ['Async schemas cannot be checked synchronously'] }
    if (result.issues)
      return {
        ok: false,
        issues: result.issues.map(
          (i) => `${(i.path ?? []).map(segment).join('.') || '(root)'}: ${i.message}`,
        ),
      }
    return { ok: true, value: result.value }
  }
}

/** An environment parser: a variable set to the empty string counts as unset, so optional and default apply (ADR 0056 A3). */
export function toEnvParse(schema: unknown): Parse | null {
  const parse = toParse(schema)
  if (!parse) return null
  return (value) =>
    parse(
      value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== ''))
        : value,
    )
}
