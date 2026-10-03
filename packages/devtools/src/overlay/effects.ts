import type { DevEffect, Json } from '@hozu/core/ir'
import { h, read, write } from './dom.ts'
import { curl, type Traced, traced } from './trace.ts'

type S = Record<string, any>
type Result = { ok: true; value: Json } | { ok: false; error: string; data: Json }

/** What the page's development client offers (`window.__hozu`, ADR 0050 G): the machine's own effect paths. */
interface PageHook {
  invoke(effect: string, input: Json): Promise<{ result: Result; tags: string[] }>
  query(query: string, input: Json): Promise<Result>
}

/** A declared endpoint (`/_hozu/dev/endpoints`). */
export interface DevEndpoint {
  ref: string
  method: 'GET' | 'POST'
  path: string
  input: S | null
  raw: boolean
  mode: string
}

export interface CallRecord {
  id: number
  ref: string
  kind: DevEffect['kind'] | 'endpoint'
  runs: DevEffect['runs']
  input: Json
  ok: boolean
  error: string | null
  value: Json
  ms: number
  where: 'server' | 'browser'
  tags: string[]
  /** True when the page re-read what the call invalidated in place; false when it needs a reload. */
  refreshed: boolean
  /** An endpoint call's HTTP status and response headers. */
  status: number | null
  headers: [string, string][]
  /** What the call sent out, on the server and in the page. */
  requests: Traced[]
  at: number
}

export interface DrawerHost {
  plain(): boolean
  /** The page's window and document (the Workbench frame's when it is open). */
  win(): Window
  path(): string
  resized(): void
  closed(): void
}

const getJson = <T>(path: string): Promise<T | null> =>
  fetch(path)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null)

export const effects = (path: string) =>
  getJson<DevEffect[]>(`/_hozu/dev/effects?path=${encodeURIComponent(path)}`)

const payloadOf = (doc: Document): S | null => {
  try {
    return JSON.parse(doc.getElementById('hozu-payload')?.textContent ?? 'null') as S | null
  } catch {
    return null
  }
}

export function example(schema: S | null): Json {
  if (!schema) return null
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum)) return schema.enum[0]
  if ('const' in schema) return schema.const
  const alternatives = schema.anyOf ?? schema.oneOf
  if (Array.isArray(alternatives))
    return example(alternatives.find((a: S) => a.type !== 'null') ?? alternatives[0])
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (type === 'object')
    return Object.fromEntries(Object.entries((schema.properties ?? {}) as S).map(([k, v]) => [k, example(v)]))
  if (type === 'array') return schema.items ? [example(schema.items)] : []
  if (type === 'number' || type === 'integer') return 0
  if (type === 'boolean') return false
  if (type === 'null') return null
  return ''
}

/** The input the page uses for a query (from its payload), else an example from the schema. */
function startInput(effect: DevEffect, doc: Document): Json {
  const data = (payloadOf(doc)?.data ?? []) as [string, unknown][]
  const key = data
    .map(([k]) => k)
    .find((k) => k.startsWith(effect.ref) && '{['.includes(k[effect.ref.length] ?? ''))
  if (key)
    try {
      return JSON.parse(key.slice(effect.ref.length)) as Json
    } catch {}
  return example(effect.input)
}

const scalar = (s: S) => ['string', 'number', 'integer', 'boolean'].includes(s.type) || Array.isArray(s.enum)
const flat = (schema: S) =>
  schema.type === 'object' && Object.values((schema.properties ?? {}) as S).every((p) => scalar(p as S))

const hookOf = (win: Window) => (win as Window & { __hozu?: Partial<PageHook> }).__hozu

type Outcome = Omit<CallRecord, 'id' | 'at' | 'requests'>

/** Runs an effect the way the page would: through the page's client when it has one, else the app's endpoints. */
async function call(effect: DevEffect, input: Json, win: Window): Promise<Outcome> {
  const started = performance.now()
  const hook = hookOf(win)
  const where = effect.runs === 'server' ? ('server' as const) : ('browser' as const)
  const base = {
    ref: effect.ref,
    kind: effect.kind,
    runs: effect.runs,
    input,
    where,
    status: null,
    headers: [],
  }
  const done = (result: Result, tags: string[], refreshed: boolean): Outcome => ({
    ...base,
    ok: result.ok,
    error: result.ok ? null : result.error,
    value: result.ok ? result.value : result.data,
    ms: Math.round(performance.now() - started),
    tags,
    refreshed,
  })
  try {
    if (hook?.invoke && hook.query) {
      if (effect.kind === 'mutation') {
        const { result, tags } = await hook.invoke(effect.ref, input)
        return done(result, tags, true)
      }
      return done(await hook.query(effect.ref, input), [], false)
    }
    if (effect.runs === 'browser')
      return done(
        {
          ok: false,
          error: 'Unexpected',
          data: { message: 'This page has no client: browser-run effects need one' },
        },
        [],
        false,
      )
    const query = effect.kind === 'query'
    const response = await win.fetch(query ? '/_hozu/query' : '/_hozu/effect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(query ? { query: effect.ref, input } : { effect: effect.ref, input, keys: [] }),
    })
    if (!response.ok)
      return done({ ok: false, error: 'Unexpected', data: { message: await response.text() } }, [], false)
    const body = (await response.json()) as S
    return {
      ...done((query ? body : body.result) as Result, (body.tags as string[]) ?? [], false),
      where: 'server',
    }
  } catch (error) {
    return done({ ok: false, error: 'Unexpected', data: { message: String(error) } }, [], false)
  }
}

interface Request {
  params: Record<string, string>
  body: string
  headers: [string, string][]
}

const parsed = (text: string): Json => {
  try {
    return JSON.parse(text) as Json
  } catch {
    return text
  }
}

const paramsOf = (path: string) => [...path.matchAll(/:([A-Za-z_]\w*)/g)].map((m) => m[1]!)

/** Sends a request to a declared endpoint, as a client of the app would (cookies included). */
async function send(
  endpoint: DevEndpoint,
  request: Request,
  win: Window,
): Promise<Outcome & { url: string }> {
  const started = performance.now()
  let path = endpoint.path
  for (const [name, value] of Object.entries(request.params))
    path = path.replace(`:${name}`, encodeURIComponent(value))
  const url = new URL(path, win.location.origin)
  let body: string | null = null
  const headers = new Headers(request.headers.filter(([k]) => k.trim()))
  if (endpoint.method === 'GET') {
    try {
      const query = JSON.parse(request.body || '{}') as Record<string, Json>
      for (const [k, v] of Object.entries(query))
        for (const one of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(one))
    } catch {}
  } else {
    body = request.body
    if (!headers.has('content-type') && !endpoint.raw) headers.set('content-type', 'application/json')
  }
  const base = {
    ref: endpoint.ref,
    kind: 'endpoint' as const,
    runs: 'server' as const,
    input: parsed(request.body),
    where: 'server' as const,
    tags: [],
    refreshed: false,
    url: url.href,
  }
  try {
    const response = await win.fetch(url, { method: endpoint.method, headers, body, redirect: 'manual' })
    const text = await response.text()
    let value: Json = text
    try {
      value = JSON.parse(text) as Json
    } catch {}
    return {
      ...base,
      ok: response.ok,
      error: response.ok ? null : `HTTP ${response.status}`,
      value,
      ms: Math.round(performance.now() - started),
      status: response.status,
      headers: [...response.headers],
    }
  } catch (error) {
    return {
      ...base,
      ok: false,
      error: 'Unexpected',
      value: String(error),
      ms: Math.round(performance.now() - started),
      status: null,
      headers: [],
    }
  }
}

export const hozuCall = (r: Pick<CallRecord, 'ref' | 'kind' | 'input'>, scope: DevEffect['scope']) =>
  `npx hozu call ${r.ref} --input '${JSON.stringify(r.input).replace(/'/g, "'\\''")}'${scope === 'user' ? ` --session '<the session JSON>'` : ''}${r.kind === 'mutation' ? ' --write' : ''}`

const KEY = `hozu-devtools-api:${location.host}`
interface Saved {
  tab: 'query' | 'mutation' | 'endpoint' | 'history'
  view: 'table' | 'json'
  height: number
  open: boolean
  history: CallRecord[]
}

/** A record saved by this or an older DevTools, with every field present; null when it is not one. */
const normal = (r: unknown): CallRecord | null => {
  const o = r as Partial<CallRecord> | null
  if (!o || typeof o.ref !== 'string' || typeof o.id !== 'number') return null
  return {
    kind: 'query',
    runs: 'server',
    input: null,
    ok: false,
    error: null,
    value: null,
    ms: 0,
    where: 'server',
    tags: [],
    refreshed: false,
    status: null,
    headers: [],
    requests: [],
    at: o.id,
    ...o,
  } as CallRecord
}

export function drawer(host: DrawerHost) {
  const saved = read<Partial<Saved>>(KEY, {})
  const ui: Saved = {
    tab: saved.tab ?? 'query',
    view: saved.view ?? 'table',
    height: saved.height ?? 340,
    open: saved.open ?? false,
    history: (Array.isArray(saved.history) ? saved.history : []).flatMap((r) => normal(r) ?? []),
  }
  if (!['query', 'mutation', 'endpoint', 'history'].includes(ui.tab)) ui.tab = 'query'
  const persist = () => write(KEY, { ...ui, history: ui.history.slice(0, 50) })
  let list: DevEffect[] | null = null
  let endpoints: DevEndpoint[] = []
  let session: { declared: boolean; schema: S | null; current: Json } | null = null
  let sessionOpen = false
  let sessionError: string | null = null
  let selected: number | null = ui.history[0]?.id ?? null
  let confirming: string | null = null
  const inputs = new Map<string, Json>()
  const asJson = new Set<string>()
  const requests = new Map<string, Request>()
  const running = new Set<string>()
  const el = h('section', { class: 'api', 'aria-label': 'API', hidden: true })
  let shown = false

  const height = () => (shown ? Math.min(ui.height, innerHeight - 120) : 0)
  const resize = () => {
    el.style.height = `${height()}px`
    host.resized()
  }

  const where = (runs: DevEffect['runs']) =>
    host.plain() ? { server: 'server', either: 'server, then browser', browser: 'browser' }[runs] : runs

  const remember = (outcome: Outcome, sent: Traced[]) => {
    const record: CallRecord = { ...outcome, requests: sent, id: Date.now(), at: Date.now() }
    ui.history.unshift(record)
    ui.history = ui.history.slice(0, 50)
    selected = record.id
    persist()
  }

  async function run(effect: DevEffect) {
    const input = inputs.get(effect.ref) ?? startInput(effect, host.win().document)
    running.add(effect.ref)
    confirming = null
    draw()
    const { value, requests: sent } = await traced(host.win(), () => call(effect, input, host.win()))
    running.delete(effect.ref)
    remember(value, sent)
    draw()
  }

  async function sendTo(endpoint: DevEndpoint) {
    running.add(endpoint.ref)
    draw()
    const { value, requests: sent } = await traced(host.win(), () =>
      send(endpoint, requestOf(endpoint), host.win()),
    )
    running.delete(endpoint.ref)
    const { url: _, ...outcome } = value
    remember(
      outcome,
      sent.filter((r) => r.side === 'server'),
    )
    draw()
  }

  const requestOf = (endpoint: DevEndpoint): Request => {
    let r = requests.get(endpoint.ref)
    if (!r) {
      r = {
        params: Object.fromEntries(paramsOf(endpoint.path).map((p) => [p, ''])),
        body: endpoint.raw ? '' : JSON.stringify(example(endpoint.input) ?? {}, null, 2),
        headers: [['', '']],
      }
      requests.set(endpoint.ref, r)
    }
    return r
  }

  const invalidOf = (last: CallRecord | undefined) =>
    last && !last.ok && last.error === 'Invalid'
      ? (((last.value as S | null)?.fields ?? {}) as Record<string, string | null>)
      : {}

  const jsonEditor = (label: string, value: string, onValid: (v: string) => void, rows = 5) => {
    const area = h(
      'textarea',
      { class: 'api-json-input', rows: String(rows), spellcheck: 'false', 'aria-label': label },
      [value],
    ) as HTMLTextAreaElement
    area.addEventListener('input', () => {
      try {
        JSON.parse(area.value)
        area.removeAttribute('aria-invalid')
      } catch {
        area.setAttribute('aria-invalid', 'true')
      }
      onValid(area.value)
    })
    return area
  }

  const fieldsOf = (effect: DevEffect, last: CallRecord | undefined) => {
    const schema = effect.input as S
    const props = (schema.properties ?? {}) as Record<string, S>
    const value = (inputs.get(effect.ref) ?? startInput(effect, host.win().document)) as Json
    const invalid = invalidOf(last)
    if (!flat(schema) || asJson.has(effect.ref))
      return h('div', { class: 'api-fields' }, [
        jsonEditor(`${effect.ref} input (JSON)`, JSON.stringify(value, null, 2), (text) => {
          try {
            inputs.set(effect.ref, JSON.parse(text) as Json)
          } catch {}
        }),
        Object.keys(invalid).length
          ? h(
              'em',
              { class: 'api-invalid' },
              Object.entries(invalid)
                .filter(([, m]) => m)
                .map(([k, m]) => `${k}: ${m}. `),
            )
          : null,
      ])
    if (!Object.keys(props).length) return h('span', { class: 'api-none' }, ['no input'])
    const current = { ...(value as Record<string, Json>) }
    return h(
      'div',
      { class: 'api-fields' },
      Object.entries(props).map(([name, s]) => {
        const id = `api-${effect.ref}-${name}`
        const control = Array.isArray(s.enum)
          ? h(
              'select',
              { id },
              s.enum.map((o: Json) =>
                h('option', { value: String(o), selected: current[name] === o }, [String(o)]),
              ),
            )
          : h('input', {
              id,
              type:
                s.type === 'boolean'
                  ? 'checkbox'
                  : s.type === 'number' || s.type === 'integer'
                    ? 'number'
                    : 'text',
              placeholder: s.type === 'string' ? name : '',
              ...(s.type === 'boolean'
                ? { checked: current[name] === true }
                : { value: String(current[name] ?? '') }),
              'aria-invalid': invalid[name] ? 'true' : undefined,
            })
        const update = () => {
          const c = control as HTMLInputElement
          current[name] =
            s.type === 'boolean'
              ? c.checked
              : s.type === 'number' || s.type === 'integer'
                ? Number(c.value)
                : c.value
          inputs.set(effect.ref, { ...current })
        }
        control.addEventListener('input', update)
        control.addEventListener('change', update)
        control.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') {
            e.preventDefault()
            update()
            ask(effect)
          }
        })
        return h('label', { class: 'api-field', for: id }, [
          h('span', {}, [name]),
          control,
          invalid[name] ? h('em', { class: 'api-invalid' }, [invalid[name]!]) : null,
        ])
      }),
    )
  }

  const ask = (effect: DevEffect) => {
    if (effect.kind === 'mutation' && confirming !== effect.ref) {
      confirming = effect.ref
      return draw()
    }
    void run(effect)
  }

  const row = (effect: DevEffect) => {
    const last = ui.history.find((r) => r.ref === effect.ref)
    const busy = running.has(effect.ref)
    const asking = confirming === effect.ref
    const canForm = flat(effect.input as S) && Object.keys((effect.input as S).properties ?? {}).length > 0
    return h(
      'div',
      { class: `api-row${last && last.id === selected ? ' on' : ''}`, 'data-effect': effect.ref },
      [
        h('span', { class: `api-dot ${last ? (last.ok ? 'ok' : 'bad') : ''}`, 'aria-hidden': 'true' }),
        h('div', { class: 'api-name' }, [
          h('b', {}, [host.plain() ? effect.label : effect.ref]),
          h('span', { class: `api-kind ${effect.kind === 'query' ? 'read' : 'write'}` }, [
            effect.kind === 'query' ? 'read' : 'write',
          ]),
          h('span', { class: `api-runs ${effect.runs}`, title: `runs: ${effect.runs}` }, [
            where(effect.runs),
          ]),
          effect.kind === 'query' ? h('span', { class: 'api-tag' }, [effect.freshness]) : null,
          effect.implemented
            ? h('span', { class: 'api-where', title: 'Where it is implemented' }, [
                `${effect.implemented.file}:${effect.implemented.line}`,
              ])
            : null,
          canForm
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'api-switch',
                  title: 'JSON sends any value, also one the schema rejects',
                  onclick: () => {
                    if (asJson.has(effect.ref)) asJson.delete(effect.ref)
                    else asJson.add(effect.ref)
                    draw()
                  },
                },
                [asJson.has(effect.ref) ? 'Form' : 'JSON'],
              )
            : null,
        ]),
        fieldsOf(effect, last),
        asking
          ? h('div', { class: 'api-confirm', role: 'alert' }, [
              h('span', {}, ['Writes your development data.']),
              h(
                'button',
                {
                  type: 'button',
                  class: 'api-ghost',
                  onclick: () => {
                    confirming = null
                    draw()
                  },
                },
                ['Cancel'],
              ),
              h('button', { type: 'button', class: 'api-run warn', onclick: () => void run(effect) }, [
                'Run',
              ]),
            ])
          : h(
              'button',
              {
                type: 'button',
                class: `api-run${effect.kind === 'mutation' ? ' warn' : ''}`,
                disabled: busy,
                onclick: () => ask(effect),
              },
              [busy ? 'Running…' : 'Run ▶'],
            ),
      ],
    )
  }

  const endpointRow = (endpoint: DevEndpoint) => {
    const r = requestOf(endpoint)
    const last = ui.history.find((x) => x.ref === endpoint.ref)
    const busy = running.has(endpoint.ref)
    const headerRows = r.headers.map((pair, i) => {
      const key = h('input', {
        value: pair[0],
        placeholder: 'Header',
        'aria-label': 'Header name',
      }) as HTMLInputElement
      const val = h('input', {
        value: pair[1],
        placeholder: 'Value',
        'aria-label': 'Header value',
      }) as HTMLInputElement
      key.addEventListener('input', () => {
        r.headers[i] = [key.value, val.value]
      })
      val.addEventListener('input', () => {
        r.headers[i] = [key.value, val.value]
      })
      return h('div', { class: 'api-header' }, [key, val])
    })
    return h(
      'div',
      {
        class: `api-row endpoint${last && last.id === selected ? ' on' : ''}`,
        'data-endpoint': endpoint.ref,
      },
      [
        h('span', { class: `api-dot ${last ? (last.ok ? 'ok' : 'bad') : ''}`, 'aria-hidden': 'true' }),
        h('div', { class: 'api-name' }, [
          h('span', { class: `api-method ${endpoint.method.toLowerCase()}` }, [endpoint.method]),
          h('b', {}, [endpoint.path]),
          h('span', { class: 'api-tag' }, [host.plain() ? endpoint.ref.split('.').pop()! : endpoint.ref]),
        ]),
        h('div', { class: 'api-fields' }, [
          ...Object.keys(r.params).map((p) => {
            const input = h('input', {
              value: r.params[p]!,
              placeholder: p,
              'aria-label': `Path :${p}`,
            }) as HTMLInputElement
            input.addEventListener('input', () => {
              r.params[p] = input.value
            })
            return h('label', { class: 'api-field' }, [h('span', {}, [`:${p}`]), input])
          }),
          h('div', { class: 'api-field wide' }, [
            h('span', {}, [
              endpoint.method === 'GET' ? 'Query (JSON)' : endpoint.raw ? 'Body' : 'Body (JSON)',
            ]),
            jsonEditor(`${endpoint.ref} body`, r.body, (text) => {
              r.body = text
            }),
          ]),
          h('div', { class: 'api-field wide' }, [
            h('span', {}, ['Headers']),
            ...headerRows,
            h(
              'button',
              {
                type: 'button',
                class: 'api-ghost',
                onclick: () => {
                  r.headers.push(['', ''])
                  draw()
                },
              },
              ['+ Header'],
            ),
          ]),
        ]),
        h(
          'button',
          { type: 'button', class: 'api-run', disabled: busy, onclick: () => void sendTo(endpoint) },
          [busy ? 'Sending…' : 'Send ▶'],
        ),
      ],
    )
  }

  const cell = (v: unknown) =>
    v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

  function table(value: Json): HTMLElement | null {
    if (
      Array.isArray(value) &&
      value.length &&
      value.every((r) => r && typeof r === 'object' && !Array.isArray(r))
    ) {
      const columns = [...new Set(value.flatMap((r) => Object.keys(r as object)))].slice(0, 8)
      return h('table', { class: 'api-table' }, [
        h('thead', {}, [
          h(
            'tr',
            {},
            columns.map((c) => h('th', {}, [c])),
          ),
        ]),
        h(
          'tbody',
          {},
          value.map((r) =>
            h(
              'tr',
              {},
              columns.map((c) => h('td', {}, [cell((r as S)[c])])),
            ),
          ),
        ),
      ])
    }
    if (value && typeof value === 'object' && !Array.isArray(value))
      return h('table', { class: 'api-table kv' }, [
        h(
          'tbody',
          {},
          Object.entries(value).map(([k, v]) => h('tr', {}, [h('th', {}, [k]), h('td', {}, [cell(v)])])),
        ),
      ])
    return null
  }

  const copyButton = (label: string, text: () => string, disabled = false, title = '') => {
    const button = h(
      'button',
      {
        type: 'button',
        class: 'api-ghost',
        disabled,
        title,
        onclick: async () => {
          await navigator.clipboard.writeText(text()).catch(() => {})
          button.textContent = 'Copied'
        },
      },
      [label],
    )
    return button
  }

  const sentList = (r: CallRecord) =>
    r.requests.length
      ? h('div', { class: 'api-sent' }, [
          h('div', { class: 'api-label' }, ['Requests it sent']),
          ...r.requests.map((t) =>
            h('details', { class: 'api-request' }, [
              h('summary', {}, [
                h('span', { class: `api-method ${t.method.toLowerCase()}` }, [t.method]),
                h('code', {}, [t.url]),
                h('span', { class: `api-code ${t.status && t.status < 400 ? 'ok' : 'bad'}` }, [
                  t.error ? 'failed' : String(t.status),
                ]),
                h('span', { class: 'api-tag' }, [
                  `${t.ms} ms · ${t.side === 'server' ? 'from the server' : 'from this browser'}`,
                ]),
              ]),
              h('div', { class: 'api-request-body' }, [
                t.error ? h('em', { class: 'api-invalid' }, [t.error]) : null,
                h('b', {}, ['Request headers']),
                h('pre', {}, [t.requestHeaders.map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)']),
                t.requestBody ? h('b', {}, ['Request body']) : null,
                t.requestBody ? h('pre', {}, [t.requestBody]) : null,
                h('b', {}, ['Response headers']),
                h('pre', {}, [t.responseHeaders.map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)']),
                t.responseBody ? h('b', {}, ['Response body']) : null,
                t.responseBody ? h('pre', {}, [t.responseBody]) : null,
                copyButton('Copy as curl', () => curl(t)),
              ]),
            ]),
          ),
        ])
      : null

  function result(r: CallRecord | undefined) {
    if (!r) return h('div', { class: 'api-empty' }, ['Run something to see its answer here.'])
    const effect = list?.find((e) => e.ref === r.ref)
    const status =
      r.kind === 'endpoint'
        ? `${r.status ?? 'No answer'}${r.ok ? '' : ` · ${r.error}`}`
        : r.ok
          ? 'OK'
          : r.error === 'Unexpected'
            ? 'Unexpected error'
            : `Declared error: ${r.error}`
    const grid = typeof r.value === 'object' ? table(r.value) : null
    return h('div', { class: 'api-result' }, [
      h('div', { class: `api-status ${r.ok ? 'ok' : 'bad'}`, role: 'status' }, [
        h('b', {}, [status]),
        ` · ${r.ms} ms · ${r.kind === 'endpoint' ? 'HTTP' : r.where === 'server' ? 'through the server' : 'in this browser'} · ${host.plain() ? (effect?.label ?? r.ref) : r.ref}`,
      ]),
      r.tags.length
        ? h('div', { class: 'api-note' }, [
            `Invalidated ${r.tags.join(', ')}`,
            r.refreshed
              ? ' · the page re-read it'
              : h(
                  'button',
                  { type: 'button', class: 'api-link', onclick: () => host.win().location.reload() },
                  [' · reload the page to see it'],
                ),
          ])
        : null,
      h('div', { class: 'api-tools' }, [
        h('div', { class: 'api-seg', role: 'group', 'aria-label': 'View' }, [
          ...(['table', 'json'] as const).map((v) =>
            h(
              'button',
              {
                type: 'button',
                'aria-pressed': ui.view === v ? 'true' : 'false',
                disabled: v === 'table' && !grid,
                onclick: () => {
                  ui.view = v
                  persist()
                  draw()
                },
              },
              [v === 'table' ? 'Table' : 'JSON'],
            ),
          ),
        ]),
        r.kind === 'endpoint'
          ? null
          : copyButton(
              'Copy as hozu call',
              () => hozuCall(r, effect?.scope ?? 'public'),
              r.runs === 'browser',
              r.runs === 'browser'
                ? 'hozu call runs server and either effects; this one needs the browser'
                : '',
            ),
      ]),
      ui.view === 'table' && grid
        ? h('div', { class: 'api-scroll' }, [grid])
        : h('pre', { class: 'api-scroll api-pre' }, [
            typeof r.value === 'string' ? r.value : (JSON.stringify(r.value, null, 2) ?? 'undefined'),
          ]),
      r.kind === 'endpoint' && r.headers.length
        ? h('details', { class: 'api-request' }, [
            h('summary', {}, ['Response headers']),
            h('pre', {}, [r.headers.map(([k, v]) => `${k}: ${v}`).join('\n')]),
          ])
        : null,
      sentList(r),
    ])
  }

  function historyList() {
    if (!ui.history.length) return [h('div', { class: 'api-empty' }, ['No calls yet.'])]
    return ui.history.map((r) =>
      h('div', { class: `api-row history${r.id === selected ? ' on' : ''}` }, [
        h('span', { class: `api-dot ${r.ok ? 'ok' : 'bad'}`, 'aria-hidden': 'true' }),
        h(
          'button',
          {
            type: 'button',
            class: 'api-open',
            onclick: () => {
              selected = r.id
              draw()
            },
          },
          [
            h('b', {}, [r.ref]),
            h('span', { class: 'api-tag' }, [new Date(r.at).toLocaleTimeString()]),
            h('span', { class: 'api-tag' }, [`${r.ms} ms`]),
            h('code', {}, [JSON.stringify(r.input)]),
          ],
        ),
        r.kind === 'endpoint'
          ? null
          : h(
              'button',
              {
                type: 'button',
                class: 'api-ghost',
                onclick: () => {
                  const effect = list?.find((e) => e.ref === r.ref)
                  if (!effect) return
                  inputs.set(r.ref, r.input)
                  ui.tab = effect.kind
                  ask(effect)
                },
              },
              ['Run again'],
            ),
      ]),
    )
  }

  function sessionBox() {
    if (!session?.declared || !sessionOpen) return null
    let text = JSON.stringify(session.current ?? example(session.schema), null, 2)
    const apply = async (value: Json) => {
      const response = await fetch('/_hozu/dev/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session: value }),
      })
      if (!response.ok) {
        sessionError =
          ((await response.json().catch(() => ({}))) as { error?: string }).error ?? response.statusText
        return draw()
      }
      sessionError = null
      sessionOpen = false
      host.win().location.reload()
    }
    return h('div', { class: 'api-row session' }, [
      h('span', {}),
      h('div', { class: 'api-name' }, [
        h('b', {}, ['Act as']),
        h('span', { class: 'api-tag' }, ['development only: sets this browser’s session cookie']),
      ]),
      h('div', { class: 'api-fields' }, [
        jsonEditor('Session (JSON)', text, (t) => {
          text = t
        }),
        sessionError ? h('em', { class: 'api-invalid' }, [sessionError]) : null,
      ]),
      h('div', { class: 'api-confirm' }, [
        h('button', { type: 'button', class: 'api-ghost', onclick: () => void apply(null) }, ['Sign out']),
        h(
          'button',
          {
            type: 'button',
            class: 'api-run',
            onclick: () => {
              try {
                void apply(JSON.parse(text) as Json)
              } catch {
                sessionError = 'The session is not valid JSON'
                draw()
              }
            },
          },
          ['Act as'],
        ),
      ]),
    ])
  }

  function draw() {
    try {
      paint()
    } catch (error) {
      el.replaceChildren(
        h('div', { class: 'api-empty', role: 'alert' }, [
          `The API drawer could not draw: ${error instanceof Error ? error.message : String(error)}. `,
          h(
            'button',
            {
              type: 'button',
              class: 'api-link',
              onclick: () => {
                ui.history = []
                selected = null
                persist()
                draw()
              },
            },
            ['Clear its saved state'],
          ),
        ]),
      )
    }
  }

  function paint() {
    const queries = (list ?? []).filter((e) => e.kind === 'query')
    const mutations = (list ?? []).filter((e) => e.kind === 'mutation')
    const tab = (id: Saved['tab'], label: string, count: number) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': ui.tab === id ? 'true' : 'false',
          onclick: () => {
            ui.tab = id
            persist()
            draw()
          },
        },
        [label, h('span', { class: 'count' }, [String(count)])],
      )
    const grip = h('div', { class: 'api-grip', title: 'Drag to resize', 'aria-hidden': 'true' })
    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      grip.setPointerCapture(event.pointerId)
      const move = (e: PointerEvent) => {
        ui.height = Math.max(160, Math.min(innerHeight - 120, innerHeight - e.clientY))
        resize()
      }
      const up = () => {
        grip.removeEventListener('pointermove', move)
        grip.removeEventListener('pointerup', up)
        persist()
      }
      grip.addEventListener('pointermove', move)
      grip.addEventListener('pointerup', up)
    })
    const rows =
      ui.tab === 'history'
        ? historyList()
        : ui.tab === 'endpoint'
          ? endpoints.map(endpointRow)
          : list === null
            ? [h('div', { class: 'api-empty' }, ['This page is not a Hozu page.'])]
            : (ui.tab === 'query' ? queries : mutations).map(row)
    const who =
      session?.declared &&
      h(
        'button',
        {
          type: 'button',
          class: `api-session${sessionOpen ? ' on' : ''}`,
          title: 'The session this browser sends; act as someone else',
          onclick: () => {
            sessionOpen = !sessionOpen
            draw()
          },
        },
        [session.current === null ? 'Signed out' : `As ${JSON.stringify(session.current)}`],
      )
    el.replaceChildren(
      grip,
      h('div', { class: 'api-head' }, [
        h('b', { class: 'api-title' }, ['API']),
        h('div', { class: 'api-tabs', role: 'tablist' }, [
          tab('query', host.plain() ? 'Reads' : 'Queries', queries.length),
          tab('mutation', host.plain() ? 'Changes' : 'Mutations', mutations.length),
          endpoints.length ? tab('endpoint', 'Endpoints', endpoints.length) : null,
          tab('history', 'History', ui.history.length),
        ]),
        h('span', { class: 'api-path' }, [host.path()]),
        who || null,
        h(
          'button',
          {
            type: 'button',
            class: 'api-close',
            'aria-label': 'Close the API drawer',
            onclick: () => show(false),
          },
          ['×'],
        ),
      ]),
      h('div', { class: 'api-body' }, [
        h('div', { class: 'api-list' }, [
          sessionBox(),
          ...(rows.length ? rows : [h('div', { class: 'api-empty' }, ['None on this page.'])]),
        ]),
        result(ui.history.find((r) => r.id === selected)),
      ]),
    )
  }

  async function reload() {
    if (!shown) return
    ;[list, endpoints, session] = await Promise.all([
      effects(host.path()),
      getJson<DevEndpoint[]>('/_hozu/dev/endpoints').then((e) => e ?? []),
      getJson<{ declared: boolean; schema: S | null; current: Json }>('/_hozu/dev/session'),
    ])
    inputs.clear()
    if (ui.tab === 'endpoint' && !endpoints.length) ui.tab = 'query'
    draw()
  }

  function show(open: boolean) {
    shown = open
    ui.open = open
    persist()
    el.hidden = !open
    resize()
    if (open) void reload()
    else host.closed()
  }

  return {
    el,
    show,
    reload,
    toggle: () => show(!shown),
    isOpen: () => shown,
    height,
    restore: () => ui.open && show(true),
  }
}
