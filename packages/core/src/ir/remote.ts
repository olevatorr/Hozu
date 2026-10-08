import { hashJson } from '../canonical/hash.ts'
import type { JsonSchema, ProjectIR } from './types.ts'

export type RemoteKind = 'query' | 'mutation' | 'endpoint'

/** One effect a remote service implements (ADR 0068): its schemas, resolved from the feature's schema table. */
export interface RemoteEffect {
  ref: string
  kind: RemoteKind
  input: JsonSchema
  output: JsonSchema
  errors: Record<string, JsonSchema>
  /** The call carries the session: user-scoped queries, mutations and endpoints of a project with a session. */
  session: boolean
  /** The framework error `Invalid { message, fields }` may be returned (mutations and endpoints). */
  invalid: boolean
}

export interface RemoteContract {
  session: JsonSchema | null
  effects: RemoteEffect[]
  /** 16 hex characters over the session and every effect; the generated contract and each call carry it. */
  fingerprint: string
  /** Effects that cannot be implemented remotely, one line each. */
  problems: { ref: string; message: string }[]
}

export function remoteContract(ir: ProjectIR, refs: readonly string[]): RemoteContract {
  const effects: RemoteEffect[] = []
  const problems: RemoteContract['problems'] = []
  for (const ref of [...new Set(refs)].sort()) {
    const dot = ref.indexOf('.')
    const feature = ir.features[ref.slice(0, dot)]
    const symbol = ref.slice(dot + 1)
    if (!feature) {
      problems.push({ ref, message: `${ref} is not a declaration of this project` })
      continue
    }
    const schema = (id: string) => feature.schemas[id] ?? {}
    const errorsOf = (errors: Record<string, string> = {}) =>
      Object.fromEntries(Object.entries(errors).map(([name, id]) => [name, schema(id)]))
    const query = feature.queries[symbol]
    const mutation = feature.mutations[symbol]
    const endpoint = feature.endpoints[symbol]
    const effect = query ?? mutation
    if (effect) {
      if (effect.runs !== 'server') {
        problems.push({
          ref,
          message: `${ref} runs: '${effect.runs}', so the browser runs it: only server effects are remote`,
        })
        continue
      }
      effects.push({
        ref,
        kind: query ? 'query' : 'mutation',
        input: schema(effect.input),
        output: schema(effect.output),
        errors: errorsOf(effect.errors),
        session: ir.session !== null && (mutation !== undefined || query?.scope === 'user'),
        invalid: mutation !== undefined,
      })
      continue
    }
    if (endpoint) {
      if (endpoint.mode !== 'json' || endpoint.raw || endpoint.output === null) {
        problems.push({
          ref,
          message: `${ref} answers ${endpoint.raw ? "input: 'raw'" : `output: '${endpoint.mode}'`}: only JSON endpoints are remote`,
        })
        continue
      }
      effects.push({
        ref,
        kind: 'endpoint',
        input: schema(endpoint.input),
        output: schema(endpoint.output),
        errors: errorsOf(endpoint.errors),
        session: ir.session !== null,
        invalid: true,
      })
      continue
    }
    problems.push({ ref, message: `${ref} is not a query, mutation or endpoint` })
  }
  const session = effects.some((e) => e.session) ? ir.session : null
  return { session, effects, fingerprint: hashJson({ session, effects }).slice(0, 16), problems }
}
