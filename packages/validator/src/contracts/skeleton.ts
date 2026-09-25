import {
  type FeatureIR,
  type Json,
  type JsonSchema,
  type ProjectIR,
  UNEXPECTED_ERROR_SCHEMA,
} from '@tenon/core/ir'
import { effectSchemas, eventSchema } from '../env.ts'
import { splitRef } from '../resolve.ts'

const obj = (v: Json | undefined): JsonSchema | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonSchema) : null

export function example(s: JsonSchema | null): Json {
  if (!s) return null
  if ('const' in s) return s.const as Json
  if (Array.isArray(s.enum)) return (s.enum[0] ?? null) as Json
  for (const k of ['anyOf', 'oneOf'] as const)
    if (Array.isArray(s[k])) {
      const variants = (s[k] as Json[]).map(obj).filter((v): v is JsonSchema => v !== null)
      return example(variants.find((v) => v.type !== 'null') ?? variants[0] ?? null)
    }
  const type = Array.isArray(s.type) ? (s.type as string[]).find((t) => t !== 'null') : s.type
  switch (type) {
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object': {
      const out: Record<string, Json> = {}
      for (const [k, v] of Object.entries(obj(s.properties) ?? {})) out[k] = example(obj(v))
      return out
    }
    default:
      return null
  }
}

const ts = (v: Json): string =>
  JSON.stringify(v, null, 1)
    .replace(/\n\s*/g, ' ')
    .replace(/"([A-Za-z_$][\w$]*)":/g, '$1:')
    .replace(/"/g, "'")

export function skeleton(ir: ProjectIR, feature: FeatureIR, id: string): string {
  const [state, kind, key, ...rest] = id.split('/') as [string, string, string, ...string[]]
  const m = feature.machine!
  const s = m.states[state]!
  const local = (ref: string) => splitRef(ref)[1]
  let step: string
  let t = s.after[Number(key)]?.transition
  if (kind === 'on') {
    t = s.on[key]![Number(rest[0])]
    step = `{ send: ${local(key)}, payload: ${ts(example(eventSchema(ir, key)))} }`
  } else if (kind === 'after') step = `{ elapse: ${s.after[Number(key)]!.ms} }`
  else if (key === 'done') {
    t = s.invoke!.done[Number(rest[0])]
    step = `{ done: ${local(s.invoke!.effect)}, result: ${ts(example(effectSchemas(ir, s.invoke!.effect)?.output ?? null))} }`
  } else {
    const error = rest[0]!
    t = s.invoke!.failed[error]![Number(rest[1])]
    const schema =
      error === 'Unexpected'
        ? UNEXPECTED_ERROR_SCHEMA
        : (effectSchemas(ir, s.invoke!.effect)?.error(error) ?? null)
    step = `{ failed: ${local(s.invoke!.effect)}, error: '${error}', data: ${ts(example(schema))} }`
  }
  const target = t?.target ?? state
  const entered = m.states[target]?.invoke
  const calls: string[] = []
  if (t?.navigate && 'link' in t.navigate)
    calls.push(`{ navigate: '${ir.routes[t.navigate.link]?.path ?? '/'}' }`)
  if (entered)
    calls.push(
      `{ effect: ${local(entered.effect)}, input: ${ts(example(effectSchemas(ir, entered.effect)?.input ?? null))} }`,
    )
  const effects = `[${calls.join(', ')}]`
  const assigned = (t?.assign ?? []).map((a) => a.path.join('.'))
  const context = ts(m.initialContext)
  return [
    'contract(machine, {',
    `  given: { state: '${state}', context: ${context} },`,
    `  when: [${step}],`,
    `  expect: { state: '${target}', context: ${context}, effects: ${effects} },`,
    '})',
    assigned.length
      ? `// decide the expected ${assigned.join(', ')}; example values above are placeholders`
      : '// example values above are placeholders',
  ].join('\n')
}
