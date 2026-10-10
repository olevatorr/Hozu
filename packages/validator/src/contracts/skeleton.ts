import {
  type FeatureIR,
  type Json,
  type JsonSchema,
  type ProjectIR,
  UNEXPECTED_ERROR_SCHEMA,
} from '@hozu/core/ir'
import { effectSchemas, eventSchema, schemaIn } from '../env.ts'
import { splitRef } from '../resolve.ts'
import { type Patch, patched, picking } from './solve.ts'

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

function changes(initial: Json, paths: readonly (readonly (string | number)[])[]): Json {
  const out: Record<string, Json> = {}
  for (const path of paths) {
    let target = out
    let source: Json = initial
    for (const [i, key] of path.entries()) {
      source = source && typeof source === 'object' && !Array.isArray(source) ? (source[key] ?? null) : null
      if (i === path.length - 1) target[key] = source
      else {
        target[key] ??= {}
        target = target[key] as Record<string, Json>
      }
    }
  }
  return out
}

export function skeleton(ir: ProjectIR, feature: FeatureIR, id: string): string {
  const [state, kind, key, ...rest] = id.split('/') as [string, string, string, ...string[]]
  const m = feature.machine!
  const s = m.states[state]!
  const local = (ref: string) => splitRef(ref)[1]
  const context = schemaIn(feature, m.context)
  let step: (patches: Patch[]) => string
  let t = s.after[Number(key)]?.transition
  let found: Patch[] | null = t ? picking([t], 0, { context }) : null
  if (kind === 'on') {
    const list = s.on[key]!
    t = list[Number(rest[0])]
    const payload = eventSchema(ir, key)
    found = picking(list, Number(rest[0]), { context, event: payload })
    step = (p) => `{ send: ${local(key)}, payload: ${ts(patched(example(payload), p, 'event'))} }`
  } else if (kind === 'after') step = () => `{ elapse: ${s.after[Number(key)]!.ms} }`
  else if (key === 'done') {
    const list = s.invoke!.done
    t = list[Number(rest[0])]
    const result = effectSchemas(ir, s.invoke!.effect)?.output ?? null
    found = picking(list, Number(rest[0]), { context, result })
    step = (p) => `{ done: ${local(s.invoke!.effect)}, result: ${ts(patched(example(result), p, 'result'))} }`
  } else {
    const error = rest[0]!
    const list = s.invoke!.failed[error]!
    t = list[Number(rest[1])]
    const schema =
      error === 'Unexpected'
        ? UNEXPECTED_ERROR_SCHEMA
        : (effectSchemas(ir, s.invoke!.effect)?.error(error) ?? null)
    found = picking(list, Number(rest[1]), { context, error: schema })
    step = (p) =>
      `{ failed: ${local(s.invoke!.effect)}, error: '${error}', data: ${ts(patched(example(schema), p, 'error'))} }`
  }
  const patches = found ?? []
  const given = patches.some((p) => p.ref === 'context')
    ? [`context: ${ts(patched({}, patches, 'context'))}`]
    : []
  const into = (to: string) =>
    Object.entries(m.states).find(
      ([name, other]) =>
        name !== to &&
        [
          ...Object.values(other.on).flat(),
          ...(other.invoke ? [...other.invoke.done, ...Object.values(other.invoke.failed).flat()] : []),
          ...other.after.map((a) => a.transition),
        ].some((x) => x.target === to),
    )?.[0]
  let back: string | null = null
  if (t?.target === 'previous') {
    const seen = new Set([state])
    let from = into(state)
    while (from && m.states[from]?.invoke && !seen.has(from)) {
      seen.add(from)
      from = into(from)
    }
    back =
      from && !m.states[from]?.invoke
        ? from
        : (Object.keys(m.states).find((n) => !m.states[n]!.invoke && n !== state) ?? m.initial)
  }
  const target = back ?? t?.target ?? state
  const entered = t?.stay ? undefined : m.states[target]?.invoke
  const calls: string[] = []
  if (t?.navigate && 'link' in t.navigate)
    calls.push(`{ navigate: '${ir.routes[t.navigate.link]?.path ?? '/'}' }`)
  if (t?.refresh?.length)
    calls.push(`{ refresh: [${t.refresh.map((r) => `${local(r.tag)}(${r.param ? '…' : ''})`).join(', ')}] }`)
  if (t?.copy) calls.push(`{ copy: '…' }`)
  if (t?.replace && 'link' in t.replace)
    calls.push(`{ replace: '${ir.routes[t.replace.link]?.path ?? '/'}' }`)
  if (entered)
    calls.push(
      `{ effect: ${local(entered.effect)}, input: ${ts(example(effectSchemas(ir, entered.effect)?.input ?? null))} }`,
    )
  const assigned = (t?.assign ?? []).map((a) => a.path)
  const expect = [`state: '${target}'`]
  if (assigned.length)
    expect.push(`changes: ${ts(changes(patched(m.initialContext, patches, 'context'), assigned))}`)
  if (calls.length) expect.push(`effects: [${calls.join(', ')}]`)
  return [
    'contract(machine, {',
    `  given: { ${[`state: '${state}'`, ...(back ? [`previous: '${back}'`] : []), ...given].join(', ')} },`,
    `  when: [${step(patches)}],`,
    `  expect: { ${expect.join(', ')} },`,
    '})',
    assigned.length
      ? `// decide the expected ${assigned.map((p) => p.join('.')).join(', ')}; example values above are placeholders`
      : '// example values above are placeholders',
  ].join('\n')
}
