import {
  type BuildResult,
  type ElementNode,
  FORM_FIELD,
  formRunnable,
  type Json,
  type ViewNode,
} from '@tenonkit/core/ir'
import type { DataRuntime } from '@tenonkit/data'
import {
  compileMachine,
  compileValue,
  equal,
  init,
  type Snapshot,
  type Step,
  transition,
} from '@tenonkit/machine'

const children = (n: ViewNode): ViewNode[] => {
  switch (n.kind) {
    case 'el':
    case 'widget':
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
  snapshots: Record<string, Snapshot>
  unchanged: boolean
  unexpected: boolean
  invalidated: string[]
  session: { value: unknown } | null
}

export async function runForm(options: {
  build: BuildResult
  data: DataRuntime
  routes: Record<string, string>
  form: ElementNode
  fields: Record<string, string>
  params: Json
  search: Json
  session: unknown
}): Promise<FormOutcome | null> {
  const { build, data, routes, form, fields, params, search } = options
  const send = form.on.submit!
  const feature = build.ir.features[send.event.slice(0, send.event.indexOf('.'))]
  if (!feature?.machine) return null
  const fns = build.bindings.fns as Record<string, (x: never) => unknown>
  const machine = compileMachine(feature, fns, routes)
  const start = init(machine).snapshot
  const payload = compileValue(
    send.payload,
    fns,
  )({
    context: start.context,
    params,
    search,
    routes,
    dom: (field) => (field === 'form' ? fields : null),
  })
  const outcome: FormOutcome = {
    navigate: null,
    snapshots: {},
    unchanged: false,
    unexpected: false,
    invalidated: [],
    session: null,
  }
  let session = options.session
  let step: Step = transition(machine, start, { type: 'event', event: send.event, payload })
  for (let guard = 0; guard < 16; guard++) {
    let next: Step | null = null
    for (const e of step.effects) {
      if (e.type === 'navigate') outcome.navigate = e.url
      if (e.type !== 'invoke') continue
      const result = (await data.run(e.effect, e.input, session)) as {
        ok: boolean
        value?: Json
        error?: string
        data?: Json
        invalidated?: string[]
        session?: unknown
      }
      outcome.invalidated.push(...(result.invalidated ?? []))
      if ('session' in result) {
        session = result.session
        outcome.session = { value: result.session }
      }
      if (!result.ok && result.error === 'Unexpected') outcome.unexpected = true
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
  }
  outcome.snapshots[feature.id] = step.snapshot
  outcome.unchanged = step.snapshot.state === start.state && equal(step.snapshot.context, start.context)
  return outcome
}

export async function formFields(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const type = request.headers.get('content-type') ?? ''
  const entries: Iterable<[string, unknown]> = type.startsWith('multipart/form-data')
    ? ((await request.formData()) as unknown as Iterable<[string, unknown]>)
    : new URLSearchParams(await request.text())
  for (const [k, v] of entries) if (k !== FORM_FIELD && !(k in out)) out[k] = typeof v === 'string' ? v : ''
  return out
}
