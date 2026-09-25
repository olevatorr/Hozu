import {
  type FeatureIR,
  type JsonSchema,
  type ProjectIR,
  type RefSource,
  UNEXPECTED_ERROR_SCHEMA,
  type ValueExpr,
} from '@tenon/core/ir'
import { resolveRef } from './resolve.ts'
import { resolvePath } from './schema.ts'

export interface Env {
  feature: FeatureIR
  sources: Partial<Record<RefSource, JsonSchema | null>>
  bindings: (JsonSchema | null)[]
}

export const schemaIn = (feature: FeatureIR | undefined, hash: string | undefined): JsonSchema | null =>
  (feature && hash !== undefined ? feature.schemas[hash] : undefined) ?? null

export function effectSchemas(ir: ProjectIR, ref: string) {
  const r = resolveRef(ir, ref, 'effect')
  if (!r) return null
  const effect = r.registry === 'queries' ? r.feature.queries[r.symbol]! : r.feature.mutations[r.symbol]!
  return {
    input: schemaIn(r.feature, effect.input),
    output: schemaIn(r.feature, effect.output),
    errors: effect.errors,
    error: (name: string) =>
      name === 'Unexpected' ? UNEXPECTED_ERROR_SCHEMA : schemaIn(r.feature, effect.errors[name]),
  }
}

export function valueSchema(ir: ProjectIR, env: Env, value: ValueExpr): JsonSchema | null {
  if ('ref' in value) {
    const base = value.ref === 'binding' ? env.bindings[value.depth] : env.sources[value.ref]
    const r = resolvePath(base ?? null, value.path)
    return r.ok ? r.schema : null
  }
  if ('test' in value) return { type: 'boolean' }
  if ('link' in value) return { type: 'string' }
  if ('fn' in value) {
    const r = resolveRef(ir, value.fn, 'fn')
    return r ? schemaIn(r.feature, r.feature.fns[r.symbol]!.output) : null
  }
  return null
}

export function contextEnv(feature: FeatureIR): Env {
  return { feature, sources: { context: schemaIn(feature, feature.machine?.context) }, bindings: [] }
}
