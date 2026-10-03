import type { DevEffect, Json } from '@hozu/core/ir'
import { h } from './dom.ts'

export interface EffectsHost {
  plain: boolean
  /** The page's document: its payload holds the inputs in use and the fetch bundles. */
  doc: Document
  reload(): void
  close(): void
}

export interface CallResult {
  ok: boolean
  error: string | null
  value: unknown
  ms: number
  invalidated: string[]
  where: 'server' | 'browser'
}

type S = Record<string, any>

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

/** The input the page is using for a query, from its payload; else an example from the schema. */
function inputFor(effect: DevEffect, doc: Document): Json {
  const data = (payloadOf(doc)?.data ?? []) as [string, unknown][]
  const key = data
    .map(([k]) => k)
    .find((k) => k.startsWith(effect.ref) && '{['.includes(k[effect.ref.length] ?? ''))
  if (key) {
    try {
      return JSON.parse(key.slice(effect.ref.length)) as Json
    } catch {}
  }
  return example(effect.input)
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

const scalar = (s: S) => ['string', 'number', 'integer', 'boolean'].includes(s.type) || Array.isArray(s.enum)

/** Server effects go through the app's own endpoints; browser-run ones load the page's fetch bundle. */
export async function call(effect: DevEffect, input: Json, doc: Document): Promise<CallResult> {
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  if (effect.runs === 'browser') {
    const payload = payloadOf(doc)
    const feature = effect.ref.slice(0, effect.ref.indexOf('.'))
    const url = payload?.fetches?.[feature]
    if (!url)
      return {
        ok: false,
        error: 'Unexpected',
        value: 'This page has no fetch bundle',
        ms: 0,
        invalidated: [],
        where: 'browser',
      }
    const failed = Symbol('fail')
    try {
      const module = (await import(/* @vite-ignore */ url)) as Record<
        string,
        (i: unknown, c: unknown) => unknown
      >
      const value = await module[effect.ref.slice(feature.length + 1)]!(input, {
        fail: (error: string, data: unknown) => {
          throw { [failed]: { error, data } }
        },
        signal: new AbortController().signal,
        env: payload?.env ?? {},
      })
      return { ok: true, error: null, value, ms: elapsed(), invalidated: [], where: 'browser' }
    } catch (thrown) {
      const marked = (thrown as Record<symbol, { error: string; data: unknown }> | null)?.[failed]
      return marked
        ? {
            ok: false,
            error: marked.error,
            value: marked.data,
            ms: elapsed(),
            invalidated: [],
            where: 'browser',
          }
        : {
            ok: false,
            error: 'Unexpected',
            value: String(thrown),
            ms: elapsed(),
            invalidated: [],
            where: 'browser',
          }
    }
  }
  const query = effect.kind === 'query'
  const response = await fetch(query ? '/_hozu/query' : '/_hozu/effect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(query ? { query: effect.ref, input } : { effect: effect.ref, input, keys: [] }),
  })
  if (!response.ok)
    return {
      ok: false,
      error: 'Unexpected',
      value: await response.text(),
      ms: elapsed(),
      invalidated: [],
      where: 'server',
    }
  const body = (await response.json()) as S
  const result = (query ? body : body.result) as S
  return {
    ok: result.ok === true,
    error: result.ok ? null : String(result.error),
    value: result.ok ? result.value : result.data,
    ms: elapsed(),
    invalidated: query ? [] : ((body.tags as string[] | undefined) ?? []),
    where: 'server',
  }
}

const where = (runs: DevEffect['runs'], plain: boolean) =>
  runs === 'server'
    ? plain
      ? 'on your server'
      : 'runs: server'
    : runs === 'browser'
      ? plain
        ? 'in the browser'
        : 'runs: browser'
      : plain
        ? 'server first, then the browser'
        : 'runs: either'

function fields(effect: DevEffect, start: Json, onChange: (v: Json) => void): HTMLElement {
  const schema = effect.input as S
  const props = (schema.properties ?? {}) as Record<string, S>
  if (schema.type === 'object' && Object.values(props).every(scalar)) {
    const value = { ...(start as Record<string, Json>) }
    if (!Object.keys(props).length) return h('div', { class: 'plain' }, ['No input.'])
    return h(
      'div',
      { class: 'fields' },
      Object.entries(props).map(([name, s]) => {
        const id = `hz-api-${effect.ref}-${name}`
        const control = Array.isArray(s.enum)
          ? h(
              'select',
              { id },
              s.enum.map((o: Json) =>
                h('option', { value: String(o), selected: value[name] === o }, [String(o)]),
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
              ...(s.type === 'boolean'
                ? { checked: value[name] === true }
                : { value: String(value[name] ?? '') }),
            })
        control.addEventListener('input', () => {
          const el = control as HTMLInputElement
          value[name] =
            s.type === 'boolean'
              ? el.checked
              : s.type === 'number' || s.type === 'integer'
                ? Number(el.value)
                : el.value
          onChange({ ...value })
        })
        return h('label', { class: 'field', for: id }, [h('span', {}, [name]), control])
      }),
    )
  }
  const area = h('textarea', { class: 'json', rows: '4', 'aria-label': 'Input (JSON)' }, [
    JSON.stringify(start, null, 2),
  ]) as HTMLTextAreaElement
  area.addEventListener('input', () => {
    try {
      onChange(JSON.parse(area.value) as Json)
      area.removeAttribute('aria-invalid')
    } catch {
      area.setAttribute('aria-invalid', 'true')
    }
  })
  return area
}

export function renderEffects(panel: HTMLElement, list: DevEffect[] | null, host: EffectsHost) {
  const outcome = (r: CallResult) =>
    h('div', { class: `result ${r.ok ? 'ok' : 'bad'}`, role: 'status' }, [
      h('div', { class: 'label' }, [
        r.ok ? 'OK' : r.error === 'Unexpected' ? 'Unexpected error' : `Declared error: ${r.error}`,
        ` · ${r.ms} ms · ${r.where === 'server' ? 'through the server' : 'in this browser (not checked against the schema)'}`,
      ]),
      h('pre', { class: 'value' }, [JSON.stringify(r.value, null, 2) ?? 'undefined']),
      r.invalidated.length
        ? h('div', { class: 'plain' }, [
            `Invalidated ${r.invalidated.join(', ')}. `,
            h('button', { class: 'link', type: 'button', onclick: host.reload }, [
              'Reload the page to see it',
            ]),
          ])
        : null,
    ])
  const card = (effect: DevEffect) => {
    let input = inputFor(effect, host.doc)
    const out = h('div')
    const writes = effect.kind === 'mutation'
    const run = h(
      'button',
      {
        class: writes ? 'warn' : '',
        type: 'button',
        onclick: async () => {
          if (writes && !confirm(`${effect.label} writes your development data. Run it?`)) return
          run.setAttribute('disabled', '')
          out.replaceChildren(h('div', { class: 'plain' }, ['Running…']))
          out.replaceChildren(outcome(await call(effect, input, host.doc)))
          run.removeAttribute('disabled')
        },
      },
      [writes ? 'Run · writes your development data' : 'Run'],
    )
    return h('details', { class: 'effect', 'data-effect': effect.ref }, [
      h('summary', {}, [
        h('b', {}, [host.plain ? effect.label : effect.ref]),
        h('span', { class: 'badge-ref' }, [where(effect.runs, host.plain)]),
        host.plain ? null : h('span', { class: 'badge-ref' }, [effect.scope, ' · ', effect.freshness]),
      ]),
      host.plain
        ? null
        : h('div', { class: 'meta' }, [
            effect.tags.length ? `tags ${effect.tags.join(', ')} · ` : '',
            effect.invalidates.length ? `invalidates ${effect.invalidates.join(', ')} · ` : '',
            `errors ${effect.errors.join(', ')} · used by ${effect.usedBy.join(', ')}`,
          ]),
      fields(effect, input, (v) => {
        input = v
      }),
      h('div', { class: 'actions' }, [run]),
      out,
    ])
  }
  const queries = (list ?? []).filter((e) => e.kind === 'query')
  const mutations = (list ?? []).filter((e) => e.kind === 'mutation')
  panel.hidden = false
  panel.replaceChildren(
    h('div', { class: 'head' }, [
      h('div', { class: 'kicker' }, [location.pathname]),
      h('h2', { class: 'title' }, ['API']),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick: host.close }, ['×']),
    ]),
    list === null
      ? h('div', { class: 'empty' }, ['This page is not a Hozu page.'])
      : h('div', { class: 'sec' }, [
          h('div', { class: 'label' }, [host.plain ? 'Data this page reads' : 'Queries']),
          ...(queries.length ? queries.map(card) : [h('div', { class: 'plain' }, ['None.'])]),
          h('div', { class: 'label' }, [host.plain ? 'Changes this page can make' : 'Mutations']),
          ...(mutations.length ? mutations.map(card) : [h('div', { class: 'plain' }, ['None.'])]),
        ]),
  )
}
