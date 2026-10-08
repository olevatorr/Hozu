import {
  type BuildResult,
  type ElementNode,
  type FormEntries,
  formEntries,
  formRunnable,
  type Json,
  type JsonSchema,
  type ViewNode,
} from '@hozu/core/ir'
import type { RequestData } from '@hozu/data'
import {
  compileMachine,
  compileValue,
  enter,
  equal,
  init,
  type Snapshot,
  type Step,
  transition,
} from '@hozu/machine'
import { seededContext } from './seed.ts'

const children = (n: ViewNode): ViewNode[] => {
  switch (n.kind) {
    case 'el':
    case 'component':
    case 'when':
      return n.children
    case 'if':
      return [...n.ifTrue, ...n.ifFalse]
    case 'each':
      return [n.item]
    case 'query':
      return [n.ready, ...(n.pending ? [n.pending] : []), ...Object.values(n.failed)]
    default:
      return []
  }
}

function find(root: ViewNode, id: string): ViewNode | null {
  if (root.id === id) return root
  for (const c of children(root)) {
    const hit = find(c, id)
    if (hit) return hit
  }
  return null
}

export function formNode(build: BuildResult, id: string): ElementNode | null {
  const feature = build.ir.features[id.slice(0, id.indexOf('.'))]
  for (const view of Object.values(feature?.views ?? {})) {
    const n = find(view.root, id)
    if (n?.kind === 'el' && n.tag === 'form' && n.on.submit && formRunnable(n.on.submit.payload)) return n
  }
  return null
}

export interface FormOutcome {
  navigate: string | null
  replace?: string
  snapshots: Record<string, Snapshot>
  unchanged: boolean
  unexpected: boolean
  invalid: boolean
  invalidated: string[]
  session: { value: unknown } | null
  /** The browser mutation this post reached: a native post cannot run it (ADR 0049). */
  needsBrowser?: string
}

const invalidOf = (issues: string[], payload: Json): { message: string; fields: Record<string, Json> } => {
  const fields: Record<string, Json> =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? Object.fromEntries(Object.keys(payload).map((k) => [k, null]))
      : {}
  for (const issue of issues) {
    const at = issue.indexOf(': ')
    const key = at < 0 ? '' : (issue.slice(0, at).split('.')[0] ?? '')
    if (key in fields && fields[key] === null) fields[key] = issue.slice(at + 2)
  }
  return { message: issues.join('; '), fields }
}

export async function runForm(options: {
  build: BuildResult
  data: RequestData
  routes: Record<string, string>
  form: ElementNode
  fields: FormEntries
  route: string
  params: Json
  search: Json
  /** The state a natively rendered form posted back, signed (ADR 0070 B1). */
  start?: Snapshot | null
}): Promise<FormOutcome | null> {
  const { build, data, routes, form, fields, route, params, search } = options
  const send = form.on.submit!
  const feature = build.ir.features[send.event.slice(0, send.event.indexOf('.'))]
  if (!feature?.machine) return null
  const fns = build.bindings.fns as Record<string, (x: never) => unknown>
  const machine = compileMachine(feature, fns, routes)
  const seeded = await seededContext(build.ir, route, feature, fns, params, search, data)
  const kept = options.start && machine.index.has(options.start.state) ? options.start : null
  const start =
    kept ??
    (seeded ? enter(machine, machine.states[machine.initial]!.name, seeded).snapshot : init(machine).snapshot)
  const payload = compileValue(
    send.payload,
    fns,
  )({
    context: start.context,
    params,
    search,
    route,
    here: params,
    routes,
    dom: (field) => (field === 'form' ? fields.first : field === 'formAll' ? fields.all : null),
  })
  const issues = build.bindings.checks[`${send.event}#payload`]?.(payload) ?? null
  const outcome: FormOutcome = {
    navigate: null,
    snapshots: {},
    unchanged: false,
    unexpected: false,
    invalid: issues !== null,
    invalidated: [],
    session: null,
  }
  let step: Step = transition(machine, start, { type: 'event', event: send.event, payload })
  for (let guard = 0; guard < 16; guard++) {
    let next: Step | null = null
    for (const e of step.effects) {
      if (e.type === 'navigate') outcome.navigate = e.url
      if (e.type === 'replace') outcome.replace = e.url
      if (e.type !== 'invoke') continue
      const dot = e.effect.indexOf('.')
      if (build.ir.features[e.effect.slice(0, dot)]?.mutations[e.effect.slice(dot + 1)]?.runs === 'browser') {
        outcome.needsBrowser = e.effect
        return outcome
      }
      if (issues && next) break
      const own = issues ? build.bindings.checks[`${e.effect}#input`]?.(e.input) : null
      const result = (
        issues && !own
          ? { ok: false, error: 'Invalid', data: invalidOf(issues, payload) }
          : await data.run(e.effect, e.input)
      ) as {
        ok: boolean
        value?: Json
        error?: string
        data?: Json
        invalidated?: string[]
      }
      outcome.invalidated.push(...(result.invalidated ?? []))
      if (!result.ok && result.error === 'Unexpected') outcome.unexpected = true
      if (!result.ok && result.error === 'Invalid') outcome.invalid = true
      next = transition(
        machine,
        step.snapshot,
        result.ok
          ? { type: 'done', entry: e.entry, result: result.value ?? null }
          : {
              type: 'failed',
              entry: e.entry,
              error: result.error ?? 'Unexpected',
              data: result.data ?? null,
            },
      )
    }
    if (!next) break
    step = next
    if (issues) break
  }
  outcome.session = data.written
  outcome.snapshots[feature.id] = step.snapshot
  outcome.unchanged = step.snapshot.state === start.state && equal(step.snapshot.context, start.context)
  return outcome
}

async function entriesOf(request: Request): Promise<Iterable<readonly [string, unknown]>> {
  const type = request.headers.get('content-type') ?? ''
  return type.startsWith('multipart/form-data')
    ? ((await request.formData()) as unknown as Iterable<[string, unknown]>)
    : new URLSearchParams(await request.text())
}

export const formFields = async (request: Request): Promise<FormEntries> =>
  formEntries(await entriesOf(request))

const isList = (s: Json | undefined): boolean => {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false
  const o = s as JsonSchema
  if (o.type === 'array' || (Array.isArray(o.type) && o.type.includes('array'))) return true
  return (['anyOf', 'oneOf'] as const).some((k) => Array.isArray(o[k]) && (o[k] as Json[]).some(isList))
}

/** An endpoint form body: a field is multi-valued exactly where its input schema property is an array. */
export async function endpointForm(schema: JsonSchema | null, request: Request): Promise<Json> {
  const { first, all } = formEntries(await entriesOf(request))
  const props = (schema?.properties ?? {}) as Record<string, Json>
  const out: Record<string, Json> = {}
  for (const k of Object.keys(all)) out[k] = isList(props[k]) ? all[k]! : first[k]!
  for (const [k, p] of Object.entries(props))
    if (!(k in out) && isList(p) && !('default' in (p as JsonSchema))) out[k] = []
  return out
}
