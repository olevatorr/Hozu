import type { DevEffect, Json } from '@hozu/core/ir'
import { h, read, write } from './dom.ts'

type S = Record<string, any>
type Result = { ok: true; value: Json } | { ok: false; error: string; data: Json }

/** What the page's development client offers (`window.__hozu`, ADR 0050 G): the machine's own effect paths. */
interface PageHook {
  invoke(effect: string, input: Json): Promise<{ result: Result; tags: string[] }>
  query(query: string, input: Json): Promise<Result>
}

export interface CallRecord {
  id: number
  ref: string
  kind: DevEffect['kind']
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

export const effects = (path: string): Promise<DevEffect[] | null> =>
  fetch(`/_hozu/dev/effects?path=${encodeURIComponent(path)}`)
    .then((r) => (r.ok ? (r.json() as Promise<DevEffect[]>) : null))
    .catch(() => null)

const payloadOf = (doc: Document): S | null => {
  try {
    return JSON.parse(doc.getElementById('hozu-payload')?.textContent ?? 'null') as S | null
  } catch {
    return null
  }
}

function example(schema: S): Json {
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum)) return schema.enum[0]
  if ('const' in schema) return schema.const
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (type === 'object')
    return Object.fromEntries(Object.entries((schema.properties ?? {}) as S).map(([k, v]) => [k, example(v)]))
  if (type === 'array') return []
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

/** Runs an effect the way the page would: through the page's client when it has one, else the app's endpoints. */
async function call(effect: DevEffect, input: Json, win: Window): Promise<Omit<CallRecord, 'id' | 'at'>> {
  const started = performance.now()
  const hook = hookOf(win)
  const where = effect.runs === 'server' ? ('server' as const) : ('browser' as const)
  const base = { ref: effect.ref, kind: effect.kind, runs: effect.runs, input, where }
  const done = (result: Result, tags: string[], refreshed: boolean) => ({
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
    const response = await fetch(query ? '/_hozu/query' : '/_hozu/effect', {
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

export const hozuCall = (r: Pick<CallRecord, 'ref' | 'kind' | 'input'>, scope: DevEffect['scope']) =>
  `npx hozu call ${r.ref} --input '${JSON.stringify(r.input).replace(/'/g, "'\\''")}'${scope === 'user' ? ` --session '<the session JSON>'` : ''}${r.kind === 'mutation' ? ' --write' : ''}`

const KEY = `hozu-devtools-api:${location.host}`
interface Saved {
  tab: 'query' | 'mutation' | 'history'
  view: 'table' | 'json'
  height: number
  open: boolean
  history: CallRecord[]
}

export function drawer(host: DrawerHost) {
  const saved = read<Partial<Saved>>(KEY, {})
  const ui: Saved = {
    tab: saved.tab ?? 'query',
    view: saved.view ?? 'table',
    height: saved.height ?? 320,
    open: saved.open ?? false,
    history: saved.history ?? [],
  }
  const persist = () => write(KEY, { ...ui, history: ui.history.slice(0, 50) })
  let list: DevEffect[] | null = null
  let selected: number | null = ui.history[0]?.id ?? null
  let confirming: string | null = null
  const inputs = new Map<string, Json>()
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
  const freshness = (e: DevEffect) => (e.kind === 'mutation' ? 'writes' : e.freshness)

  async function run(effect: DevEffect) {
    const input = inputs.get(effect.ref) ?? startInput(effect, host.win().document)
    running.add(effect.ref)
    confirming = null
    draw()
    const record = { ...(await call(effect, input, host.win())), id: Date.now(), at: Date.now() }
    running.delete(effect.ref)
    ui.history.unshift(record)
    ui.history = ui.history.slice(0, 50)
    selected = record.id
    persist()
    draw()
  }

  const fieldsOf = (effect: DevEffect, last: CallRecord | undefined) => {
    const schema = effect.input as S
    const props = (schema.properties ?? {}) as Record<string, S>
    const value = (inputs.get(effect.ref) ?? startInput(effect, host.win().document)) as Json
    const invalid =
      last && !last.ok && last.error === 'Invalid'
        ? (((last.value as S | null)?.fields ?? {}) as Record<string, string | null>)
        : {}
    if (flat(schema)) {
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
    const area = h(
      'textarea',
      { class: 'api-json-input', rows: '3', 'aria-label': `${effect.ref} input (JSON)` },
      [JSON.stringify(value, null, 2)],
    ) as HTMLTextAreaElement
    area.addEventListener('input', () => {
      try {
        inputs.set(effect.ref, JSON.parse(area.value) as Json)
        area.removeAttribute('aria-invalid')
      } catch {
        area.setAttribute('aria-invalid', 'true')
      }
    })
    return area
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
    return h(
      'div',
      { class: `api-row${last && last.id === selected ? ' on' : ''}`, 'data-effect': effect.ref },
      [
        h('span', { class: `api-dot ${last ? (last.ok ? 'ok' : 'bad') : ''}`, 'aria-hidden': 'true' }),
        h('div', { class: 'api-name' }, [
          h('b', {}, [host.plain() ? effect.label : effect.ref]),
          h('span', { class: `api-runs ${effect.runs}`, title: `runs: ${effect.runs}` }, [
            where(effect.runs),
          ]),
          h('span', { class: 'api-tag' }, [freshness(effect)]),
          effect.implemented
            ? h('span', { class: 'api-where', title: 'Where it is implemented' }, [
                `${effect.implemented.file}:${effect.implemented.line}`,
              ])
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

  function result(r: CallRecord | undefined) {
    if (!r) return h('div', { class: 'api-empty' }, ['Run something to see its answer here.'])
    const effect = list?.find((e) => e.ref === r.ref)
    const status = r.ok ? 'OK' : r.error === 'Unexpected' ? 'Unexpected error' : `Declared error: ${r.error}`
    const grid = r.ok ? table(r.value) : null
    const copy = h(
      'button',
      {
        type: 'button',
        class: 'api-ghost',
        disabled: r.runs === 'browser',
        title:
          r.runs === 'browser' ? 'hozu call runs server and either effects; this one needs the browser' : '',
        onclick: async () => {
          await navigator.clipboard.writeText(hozuCall(r, effect?.scope ?? 'public')).catch(() => {})
          copy.textContent = 'Copied'
        },
      },
      ['Copy as hozu call'],
    )
    return h('div', { class: 'api-result' }, [
      h('div', { class: `api-status ${r.ok ? 'ok' : 'bad'}`, role: 'status' }, [
        h('b', {}, [status]),
        ` · ${r.ms} ms · ${r.where === 'server' ? 'through the server' : 'in this browser'} · ${host.plain() ? (effect?.label ?? r.ref) : r.ref}`,
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
        copy,
      ]),
      ui.view === 'table' && grid
        ? h('div', { class: 'api-scroll' }, [grid])
        : h('pre', { class: 'api-scroll api-pre' }, [JSON.stringify(r.value, null, 2) ?? 'undefined']),
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
        h(
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

  function draw() {
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
        : list === null
          ? [h('div', { class: 'api-empty' }, ['This page is not a Hozu page.'])]
          : (ui.tab === 'query' ? queries : mutations).map(row)
    el.replaceChildren(
      grip,
      h('div', { class: 'api-head' }, [
        h('b', { class: 'api-title' }, ['API']),
        h('div', { class: 'api-tabs', role: 'tablist' }, [
          tab('query', host.plain() ? 'Reads' : 'Queries', queries.length),
          tab('mutation', host.plain() ? 'Changes' : 'Mutations', mutations.length),
          tab('history', 'History', ui.history.length),
        ]),
        h('span', { class: 'api-path' }, [host.path()]),
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
        h(
          'div',
          { class: 'api-list' },
          rows.length ? rows : [h('div', { class: 'api-empty' }, ['None on this page.'])],
        ),
        result(ui.history.find((r) => r.id === selected)),
      ]),
    )
  }

  async function reload() {
    if (!shown) return
    list = await effects(host.path())
    inputs.clear()
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
