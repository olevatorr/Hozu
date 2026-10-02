import type { DevLocation, DevNode } from '@hozu/core/ir'
import { describeFor, friendlyName, questionFor } from '../plain.ts'
import {
  type HozuRequest,
  labelOf,
  requestMarkdown,
  type Scope,
  type StyleChange,
  scopesFor,
} from '../prompt.ts'
import { finish, node, one, page, remove, type SavedSummary, save, saved, theme } from './api.ts'
import { h, read, write } from './dom.ts'
import { lookSection, preview } from './look.ts'
import { css, outlineCss } from './style.ts'

interface Pick {
  id: string
  index: number
  note: string
  scope: Scope | null
  visible: string
  style?: StyleChange[]
}

type Audience = 'builder' | 'developer'

interface State {
  mode: 'browse' | 'select'
  picks: Pick[]
  active: number
  panel: 'inspector' | 'requests' | 'settings' | null
  opened: string | null
  dock: { x: number; y: number } | null
  audience: Audience
  excerpt: boolean
}

const key = `hozu-devtools:${location.host}`
const given = document.querySelector<HTMLScriptElement>('script[src$="/_hozu/devtools/overlay/index.js"]')
  ?.dataset.mode
const state: State = {
  mode: 'browse',
  picks: [],
  active: 0,
  panel: null,
  opened: null,
  dock: null,
  audience: given === 'developer' ? 'developer' : 'builder',
  excerpt: false,
  ...read<Partial<State>>(key, {}),
}
const persist = () => write(key, state)

const host = document.createElement('hozu-devtools')
const shadow = host.attachShadow({ mode: 'open' })
const root = h('div', { class: 'root' })
const hover = h('div', { class: 'box', hidden: true }, [h('div', { class: 'tag' })])
const boxes = h('div')
const dock = h('div', { class: 'dock', role: 'toolbar', 'aria-label': 'Hozu DevTools' })
const panel = h('div', {
  class: 'panel',
  role: 'dialog',
  'aria-label': 'Hozu DevTools inspector',
  hidden: true,
})
shadow.append(h('style', {}, [css]), root)
root.append(boxes, hover, panel, dock)

const outline = document.createElement('hozu-devtools-outline')
outline.style.cssText =
  'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646;mix-blend-mode:difference'
const frames = h('div')
outline.attachShadow({ mode: 'open' }).append(h('style', {}, [outlineCss]), frames)
document.documentElement.append(outline, host)

const clear = (color: string) => color === 'transparent' || /rgba\(.*,\s*0\)$/.test(color)
if (clear(getComputedStyle(document.documentElement).backgroundColor)) {
  const body = document.body ? getComputedStyle(document.body).backgroundColor : 'transparent'
  document.documentElement.style.backgroundColor = clear(body) ? 'Canvas' : body
}

const frameOf = new WeakMap<HTMLElement, HTMLElement>()
const framed = (box: HTMLElement, selected: boolean) => {
  const frame = h('div', { class: selected ? 'frame selected' : 'frame', hidden: true })
  frames.append(frame)
  frameOf.set(box, frame)
  return box
}
framed(hover, false)

const ours = (event: Event) => event.composedPath().includes(host)
const parentId = (id: string) => id.slice(0, id.lastIndexOf('/'))
const isText = (n: DevNode | null) => n?.kind === 'text'

function elementOf(pick: { id: string; index: number }): Element | null {
  const all = document.querySelectorAll(`[data-hz="${CSS.escape(pick.id)}"]`)
  if (all.length) return all[Math.min(pick.index, all.length - 1)] ?? null
  return pick.id.includes('/') ? elementOf({ id: parentId(pick.id), index: pick.index }) : null
}

function indexOf(el: Element): number {
  const id = el.getAttribute('data-hz') ?? ''
  return [...document.querySelectorAll(`[data-hz="${CSS.escape(id)}"]`)].indexOf(el)
}

const visibleOf = (el: Element | null) =>
  ((el as HTMLElement | null)?.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)

function place(box: HTMLElement, el: Element | null) {
  const r = el?.getBoundingClientRect()
  const frame = frameOf.get(box)
  const hide = !r || (r.width === 0 && r.height === 0)
  box.hidden = hide
  if (frame) frame.hidden = hide
  if (!r || hide) return
  for (const target of frame ? [box, frame] : [box]) {
    target.style.left = `${r.left - 3}px`
    target.style.top = `${r.top - 3}px`
    target.style.width = `${r.width + 6}px`
    target.style.height = `${r.height + 6}px`
  }
  box.classList.toggle('below', r.top < 28)
}

let hovered: Element | null = null

function tagText(n: DevNode | null, el: Element): (Node | string)[] {
  if (!n) return [el.tagName.toLowerCase()]
  if (state.audience === 'builder')
    return [
      friendlyName(n),
      n.component && n.component.uses > 1 ? h('b', {}, [`  shared · ${n.component.uses} places`]) : '',
    ]
  return [
    h('b', {}, [n.kind === 'element' ? '' : `${n.kind} `]),
    labelOf(n),
    n.location ? `  ${n.location.file}:${n.location.line}` : '',
  ]
}

async function showHover(el: Element | null) {
  hovered = el
  if (!el || state.mode !== 'select') {
    hover.hidden = true
    const frame = frameOf.get(hover)
    if (frame) frame.hidden = true
    return
  }
  place(hover, el)
  const tag = hover.firstElementChild as HTMLElement
  tag.replaceChildren(el.tagName.toLowerCase())
  const n = await node(el.getAttribute('data-hz') ?? '')
  if (hovered === el) tag.replaceChildren(...tagText(n, el))
}

function drawPicks() {
  for (const p of state.picks) preview(elementOf(p), p.style ?? [])
  for (const box of boxes.children) frameOf.get(box as HTMLElement)?.remove()
  boxes.replaceChildren(
    ...state.picks.map((p, i) => {
      const box = framed(
        h('div', { class: 'box selected' }, [
          state.picks.length > 1 ? h('div', { class: 'badge' }, [String(i + 1)]) : null,
        ]),
        true,
      )
      place(box, elementOf(p))
      return box
    }),
  )
}

function frame() {
  if (state.picks.length) {
    let i = 0
    for (const box of boxes.children) {
      const p = state.picks[i++]
      if (p) place(box as HTMLElement, elementOf(p))
    }
  }
  if (hovered && state.mode === 'select') place(hover, hovered)
  requestAnimationFrame(frame)
}

function select(pick: Omit<Pick, 'note' | 'scope'>, add: boolean) {
  const existing = state.picks.findIndex((p) => p.id === pick.id && p.index === pick.index)
  if (add && existing >= 0) state.active = existing
  else if (add) {
    state.picks.push({ ...pick, note: '', scope: null })
    state.active = state.picks.length - 1
  } else {
    const keep = state.picks[state.active]
    state.picks = [{ ...pick, note: keep && !state.picks[1] ? keep.note : '', scope: null }]
    state.active = 0
  }
  state.panel = 'inspector'
  persist()
  drawPicks()
  void renderPanel()
}

function markedFrom(event: Event): Element | null {
  for (const target of event.composedPath())
    if (target instanceof Element && target !== host && target.hasAttribute('data-hz')) return target
  return null
}

async function selectText(event: MouseEvent) {
  const el = markedFrom(event)
  if (!el) return
  const n = await node(el.getAttribute('data-hz') ?? '')
  const texts = n?.children.filter((c) => c.kind === 'text') ?? []
  if (!n || !texts.length) return
  const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY)?.offsetNode
  const domTexts = [...el.childNodes].filter((c) => c.nodeType === 3 && c.textContent?.trim())
  const at = caret ? domTexts.indexOf(caret as ChildNode) : -1
  const hit = caret?.textContent?.trim() ?? ''
  const match =
    texts.find((t) => t.source?.kind === 'literal' && t.source.detail.trim() === hit) ??
    (at >= 0 && domTexts.length === texts.length ? texts[at] : texts[0])
  if (match) select({ id: match.id, index: indexOf(el), visible: hit || visibleOf(el) }, event.shiftKey)
}

const blocked = [
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'submit',
]
for (const type of blocked)
  window.addEventListener(
    type,
    (event) => {
      if (state.mode !== 'select' || ours(event)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (type === 'dblclick') void selectText(event as MouseEvent)
      if (type !== 'click') return
      const mouse = event as MouseEvent
      const clicked = markedFrom(event)
      const el = mouse.altKey ? (clicked?.parentElement?.closest('[data-hz]') ?? clicked) : clicked
      if (!el) return
      select(
        { id: el.getAttribute('data-hz') ?? '', index: indexOf(el), visible: visibleOf(el) },
        mouse.shiftKey,
      )
    },
    { capture: true },
  )

window.addEventListener(
  'pointermove',
  (event) => {
    if (state.mode !== 'select') return
    const el = ours(event) ? null : markedFrom(event)
    if (el !== hovered) void showHover(el)
  },
  { capture: true, passive: true },
)

function walk(direction: 'up' | 'down') {
  const active = state.picks[state.active]
  if (!active) return
  const el = elementOf(active)
  const own = el?.getAttribute('data-hz') === active.id
  const next =
    direction === 'up'
      ? own
        ? el?.parentElement?.closest('[data-hz]')
        : el
      : own
        ? el?.querySelector('[data-hz]')
        : null
  if (!next) return
  state.picks[state.active] = {
    ...active,
    id: next.getAttribute('data-hz') ?? '',
    index: indexOf(next),
    visible: visibleOf(next),
    scope: null,
  }
  persist()
  drawPicks()
  void renderPanel()
}

function setMode(mode: State['mode']) {
  state.mode = mode
  if (mode === 'browse') void showHover(null)
  persist()
  renderDock()
}

window.addEventListener(
  'keydown',
  (event) => {
    const typing = event
      .composedPath()
      .some((t) => t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)
    if (event.altKey && event.shiftKey && event.code === 'KeyS') {
      event.preventDefault()
      return setMode(state.mode === 'select' ? 'browse' : 'select')
    }
    if (typing) return
    if (event.key === 'Escape' && state.mode === 'select') return setMode('browse')
    if (event.key === 'Escape' && state.panel) {
      state.panel = null
      persist()
      return void renderPanel()
    }
    if (
      state.mode === 'select' &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
      state.picks.length
    ) {
      event.preventDefault()
      walk(event.key === 'ArrowUp' ? 'up' : 'down')
    }
  },
  { capture: true },
)

function renderDock() {
  const button = (label: string, mode: State['mode']) =>
    h(
      'button',
      {
        class: 'mode',
        type: 'button',
        'aria-pressed': String(state.mode === mode),
        onclick: () => setMode(mode),
      },
      [label],
    )
  dock.replaceChildren(
    ...present([
      h('div', { class: 'grip', title: 'Hozu DevTools · drag to move · Alt+Shift+S toggles Select' }, ['H']),
      h('div', { class: 'seg' }, [button('Browse', 'browse'), button('Select', 'select')]),
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          onclick: () => {
            state.panel = state.panel === 'requests' ? (state.picks.length ? 'inspector' : null) : 'requests'
            state.opened = null
            persist()
            void renderPanel()
          },
        },
        ['Requests', h('span', { class: 'count', 'data-count': true })],
      ),
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          title: 'Select this page: its title, description and other head fields',
          onclick: async () => {
            const n = await page(location.pathname)
            if (n)
              select(
                { id: n.id, index: 0, visible: document.title },
                state.mode === 'select' && state.picks.length > 0,
              )
          },
        },
        ['Page'],
      ),
      h(
        'button',
        {
          class: 'act gear',
          type: 'button',
          title: 'Settings',
          'aria-label': 'Settings',
          onclick: () => {
            state.panel = state.panel === 'settings' ? (state.picks.length ? 'inspector' : null) : 'settings'
            persist()
            void renderPanel()
          },
        },
        ['⚙'],
      ),
      state.mode === 'select'
        ? h('div', { class: 'hint' }, ['Click selects · Shift adds · Alt goes up · Esc stops'])
        : null,
    ]),
  )
  void saved().then((list) => {
    const count = dock.querySelector('[data-count]')
    const open = list.filter((r) => r.status === 'open').length
    if (count) count.textContent = open ? String(open) : ''
  })
  placeDock()
}

function placeDock() {
  const r = dock.getBoundingClientRect()
  const x = state.dock
    ? Math.min(Math.max(0, state.dock.x), innerWidth - r.width)
    : (innerWidth - r.width) / 2
  const y = state.dock
    ? Math.min(Math.max(0, state.dock.y), innerHeight - r.height)
    : innerHeight - r.height - 24
  dock.style.left = `${x}px`
  dock.style.top = `${y}px`
}

dock.addEventListener('pointerdown', (event) => {
  if (!(event.target as Element).closest('.grip')) return
  const r = dock.getBoundingClientRect()
  const dx = event.clientX - r.left
  const dy = event.clientY - r.top
  const move = (e: PointerEvent) => {
    state.dock = { x: e.clientX - dx, y: e.clientY - dy }
    placeDock()
  }
  const up = () => {
    persist()
    removeEventListener('pointermove', move)
    removeEventListener('pointerup', up)
  }
  addEventListener('pointermove', move)
  addEventListener('pointerup', up)
})
addEventListener('resize', placeDock)

const where = (what: string, l: DevLocation | null) =>
  l
    ? h('div', { class: 'loc' }, [
        h('span', { class: 'what' }, [what]),
        h('span', {}, [`${l.file}:${l.line}:${l.column}`]),
        h(
          'button',
          {
            type: 'button',
            title: 'Copy the location',
            onclick: () => void copy(`${l.file}:${l.line}:${l.column}`),
          },
          ['Copy'],
        ),
      ])
    : null

function excerpt(n: DevNode) {
  if (!n.excerpt) return null
  return h(
    'pre',
    {},
    n.excerpt.lines.map((line, i) => {
      const number = n.excerpt!.start + i
      return h('span', { class: number === n.location?.line ? 'on' : '' }, [
        h('i', {}, [String(number).padStart(3)]),
        line,
      ])
    }),
  )
}

const present = (nodes: (Node | null)[]) => nodes.filter((n): n is Node => n !== null)

const section = (label: string, children: (Node | null)[]) =>
  children.some(Boolean)
    ? h('div', { class: 'sec' }, [h('div', { class: 'label' }, [label]), ...children])
    : null

const kindTitle: Record<string, string> = {
  element: 'Element',
  component: 'Component use',
  text: 'Text',
  query: 'Query',
  when: 'State branch',
  if: 'Branch',
  list: 'List',
  html: 'Raw HTML',
  embed: 'Embed',
  other: 'Node',
}

function kicker(n: DevNode) {
  if (state.audience === 'builder') return n.page ? `Page ${n.page.path}` : `On ${location.pathname}`
  const kind = n.component
    ? 'Component use'
    : n.kind === 'text' && n.source?.kind === 'data'
      ? 'Data text'
      : (kindTitle[n.kind] ?? n.kind)
  if (n.page) return `Page · route ${n.page.path}`
  return `${kind} · view ${n.owner?.feature}.${n.owner?.view}`
}

function titleFor(n: DevNode, active: Pick) {
  const text = (active.visible || n.text || '').slice(0, 40)
  if (state.audience === 'builder')
    return [friendlyName(n), text && !n.page ? h('span', { class: 'quote' }, [`“${text}”`]) : null]
  return [
    n.page
      ? n.page.head.title || n.page.route
      : n.tag
        ? `<${n.tag}>`
        : n.kind === 'text'
          ? `“${text}”`
          : (kindTitle[n.kind] ?? n.kind),
    n.component ? h('code', {}, [n.component.ref]) : null,
  ]
}

function textRows(n: DevNode) {
  const sources = n.source
    ? [{ id: n.id, source: n.source }]
    : n.children.flatMap((c) => (c.source ? [{ id: c.id, source: c.source }] : []))
  return sources.map(({ source }) =>
    h('div', { class: 'row' }, [
      h('b', {}, [source.kind === 'literal' ? 'text ' : `${source.kind} `]),
      source.kind === 'literal' ? `“${source.detail}”` : source.detail,
      source.location ? `  ${source.location.file}:${source.location.line}` : '',
      (source.uses ?? 1) > 1 ? h('span', { class: 'warn' }, [` · shared by ${source.uses} places`]) : null,
    ]),
  )
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = h('textarea') as HTMLTextAreaElement
    area.value = text
    shadow.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

async function request(): Promise<HozuRequest> {
  const nodes = await Promise.all(state.picks.map((p) => node(p.id)))
  return {
    items: state.picks.flatMap((p, i) => {
      const n = nodes[i]
      return n
        ? [
            {
              node: n,
              note: p.note,
              scope: p.scope ?? scopesFor(n)[0]!.scope,
              visible: p.visible,
              style: p.style ?? [],
            },
          ]
        : []
    }),
    context: {
      path: location.pathname + location.search,
      viewport: { width: innerWidth, height: innerHeight },
      preview: null,
    },
  }
}

function status(el: HTMLElement, kind: 'ok' | 'err', parts: (Node | string)[]) {
  el.className = `status ${kind}`
  el.replaceChildren(...parts)
}

const open = (panelName: State['panel'], opened: string | null = null) => {
  state.panel = panelName
  state.opened = opened
  persist()
  void renderPanel()
}

const closeButton = (onclick: () => void) =>
  h('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick }, ['×'])

function choose(active: Pick, id: string, visible: string) {
  state.picks[state.active] = { ...active, id, scope: null, visible }
  persist()
  drawPicks()
  void renderPanel()
}

function removeActive() {
  const gone = state.picks[state.active]
  if (gone) preview(elementOf(gone), [])
  state.picks.splice(state.active, 1)
  state.active = Math.max(0, state.active - 1)
  if (!state.picks.length) state.panel = null
  persist()
  drawPicks()
  void renderPanel()
}

function scopeField(n: DevNode, active: Pick) {
  const scopes = scopesFor(n)
  if (scopes.length < 2) return null
  const scope = active.scope ?? scopes[0]!.scope
  const asked = state.audience === 'builder' ? questionFor(n) : null
  return h('fieldset', {}, [
    asked ? h('legend', {}, [asked.question]) : null,
    ...scopes.map((s) =>
      h('label', {}, [
        h('input', {
          type: 'radio',
          name: 'scope',
          value: s.scope,
          checked: s.scope === scope,
          onchange: () => {
            active.scope = s.scope
            persist()
          },
        }),
        asked?.options[s.scope] ?? s.label,
      ]),
    ),
  ])
}

function requestSection(n: DevNode, active: Pick) {
  const note = h('textarea', {
    'aria-label': 'What should change?',
    placeholder: 'What should change? For example: “Make it bigger and use the brand red”',
    oninput: (event) => {
      active.note = (event.target as HTMLTextAreaElement).value
      persist()
    },
  }) as HTMLTextAreaElement
  note.value = active.note
  const result = h('div', { class: 'status', role: 'status' })
  const draft = h('textarea', {
    class: 'draft',
    'aria-label': 'The request, as the agent will read it',
    hidden: true,
  }) as HTMLTextAreaElement
  const markdown = async () =>
    draft.hidden
      ? requestMarkdown(await request(), { excerpt: state.excerpt, theme: await theme() })
      : draft.value
  const edit = h(
    'button',
    {
      class: 'link',
      type: 'button',
      onclick: async () => {
        if (draft.hidden)
          draft.value = requestMarkdown(await request(), { excerpt: state.excerpt, theme: await theme() })
        draft.hidden = !draft.hidden
        edit.textContent = draft.hidden ? 'Edit before sending' : 'Discard edits'
      },
    },
    ['Edit before sending'],
  )
  return h('div', { class: 'sec' }, [
    h('div', { class: 'label' }, [
      state.picks.length > 1
        ? `Request · ${state.picks.length} items · this is item ${state.active + 1}`
        : 'Request',
    ]),
    scopeField(n, active),
    note,
    h('div', { class: 'row-end' }, [edit]),
    draft,
    h('div', { class: 'actions' }, [
      h(
        'button',
        {
          class: 'primary',
          type: 'button',
          onclick: async () => {
            await copy(await markdown())
            status(result, 'ok', ['Copied. Paste it to your agent.'])
          },
        },
        ['Copy for AI'],
      ),
      h(
        'button',
        {
          type: 'button',
          onclick: async () => {
            try {
              const done = await save(await markdown())
              const ask = `Do the Hozu request ${done.file}`
              await copy(ask)
              status(result, 'ok', [
                'Saved ',
                h('code', {}, [done.file]),
                '. Copied “',
                ask,
                '”: paste it to your agent.',
              ])
              renderDock()
            } catch (e) {
              status(result, 'err', [`Not saved: ${(e as Error).message}`])
            }
          },
        },
        ['Save request'],
      ),
      h(
        'button',
        {
          type: 'button',
          onclick: async () => {
            const a = h('a', {
              href: URL.createObjectURL(new Blob([await markdown()], { type: 'text/markdown' })),
              download: 'hozu-request.md',
            })
            a.click()
            status(result, 'ok', ['Downloaded hozu-request.md'])
          },
        },
        ['Download .md'],
      ),
    ]),
    result,
  ])
}

function builderSections(n: DevNode) {
  const children = n.children.filter((c) => c.kind !== 'text')
  return [
    section(
      'About it',
      describeFor(n).map((line) => h('div', { class: 'plain' }, [line])),
    ),
    h('div', { class: 'sec' }, [
      h('div', { class: 'nav' }, [
        h('button', { type: 'button', onclick: () => walk('up') }, ['↑ Select the area around it']),
        children.length && !isText(n)
          ? h('button', { type: 'button', onclick: () => walk('down') }, ['↓ Inside'])
          : null,
        h('button', { type: 'button', onclick: removeActive }, ['Remove']),
      ]),
      n.location
        ? h('div', { class: 'file' }, [
            `${n.location.file}:${n.location.line}`,
            h(
              'button',
              {
                class: 'link',
                type: 'button',
                onclick: () => void copy(`${n.location!.file}:${n.location!.line}`),
              },
              ['Copy'],
            ),
          ])
        : null,
    ]),
  ]
}

function developerSections(n: DevNode, active: Pick) {
  const children = n.children.filter((c) => c.kind !== 'text' || c.text)
  return [
    section('Where', [
      where(n.page ? 'page' : 'view', n.location),
      n.page ? where('route', n.page.routeLocation) : null,
      n.component ? where('component', n.component.declaration) : null,
      n.events.length ? where('machine', n.machine) : null,
      excerpt(n),
    ]),
    section(
      'Component',
      n.component
        ? [
            h('div', {}, [
              h('span', { class: 'chip red' }, [n.component.ref]),
              h('span', { class: 'chip' }, [
                `used in ${n.component.uses} ${n.component.uses === 1 ? 'place' : 'places'}`,
              ]),
              ...Object.entries(n.component.variant).map(([k, v]) =>
                h('span', { class: 'chip' }, [`${k}=${v}`]),
              ),
            ]),
          ]
        : [],
    ),
    section(
      'Head',
      n.page
        ? [
            ...(['title', 'description', 'image'] as const).map((f) =>
              h('div', { class: 'row' }, [h('b', {}, [`${f} `]), n.page!.head[f] ?? '—']),
            ),
            h('div', { class: 'row' }, [h('b', {}, ['views ']), n.page.views.join(', ')]),
            n.page.head.noindex ? h('div', { class: 'row' }, [h('b', {}, ['noindex'])]) : null,
            n.page.head.query
              ? h('div', { class: 'row' }, [h('b', {}, ['query ']), n.page.head.query])
              : null,
          ]
        : [],
    ),
    section('Text', textRows(n)),
    section(
      'Shown when',
      n.conditions.map((c) =>
        h('div', { class: 'row' }, [
          h('b', {}, [`${c.kind} `]),
          c.detail,
          c.location ? `  ${c.location.file}:${c.location.line}` : '',
        ]),
      ),
    ),
    section(
      'Behaviour',
      n.events.map((e) =>
        h('div', { class: 'row' }, [
          h('span', { class: 'chip red' }, [`on ${e.dom}`]),
          h('span', { class: 'chip' }, [e.event]),
          ...e.transitions.map((t) =>
            h('span', { class: 'chip' }, [`${t.from} → ${t.to}${t.guarded ? ' if …' : ''}`]),
          ),
        ]),
      ),
    ),
    section('Inside', [
      children.length
        ? h(
            'div',
            { class: 'kids' },
            children.map((c) =>
              h(
                'button',
                {
                  type: 'button',
                  onclick: () =>
                    choose(active, c.id, c.kind === 'text' ? (c.source?.detail ?? '') : active.visible),
                },
                [c.kind === 'text' ? `text  ${c.text}` : `${c.kind}  ${c.id.split('/').slice(-1)[0]}`],
              ),
            ),
          )
        : null,
      h('div', { class: 'nav' }, [
        h('button', { type: 'button', onclick: () => walk('up') }, ['↑ Parent']),
        isText(n) ? null : h('button', { type: 'button', onclick: () => walk('down') }, ['↓ Child']),
        h('button', { type: 'button', onclick: removeActive }, ['Remove']),
      ]),
    ]),
    h('div', { class: 'sec meta' }, [`node ${n.id}`, n.pointer ? ` · ${n.pointer}` : '']),
  ]
}

async function renderPanel() {
  if (state.panel === 'requests')
    return state.opened ? renderRequest(state.opened) : renderRequests(await saved())
  if (state.panel === 'settings') return renderSettings()
  const active = state.picks[state.active]
  if (state.panel !== 'inspector' || !active) {
    panel.hidden = true
    return
  }
  const n = await node(active.id)
  if (!n) {
    panel.hidden = false
    panel.replaceChildren(
      h('div', { class: 'empty' }, [
        h('b', {}, ['This part is gone.']),
        ' The code changed since you selected it: select it again.',
      ]),
    )
    return
  }
  const nodes = await Promise.all(state.picks.map((p) => node(p.id)))
  panel.hidden = false
  panel.replaceChildren(
    ...present([
      h('div', { class: 'head' }, [
        h('div', { class: 'kicker' }, [kicker(n)]),
        h('h2', { class: 'title' }, titleFor(n, active)),
        closeButton(() => open(null)),
        state.picks.length > 1
          ? h(
              'div',
              { class: 'picks' },
              state.picks.map((p, i) =>
                h(
                  'button',
                  {
                    type: 'button',
                    'aria-current': String(i === state.active),
                    onclick: () => {
                      state.active = i
                      persist()
                      void renderPanel()
                    },
                  },
                  [
                    `${i + 1} ${nodes[i] ? (state.audience === 'builder' ? friendlyName(nodes[i]!) : labelOf(nodes[i]!)) : p.id}`,
                  ],
                ),
              ),
            )
          : null,
      ]),
      ...(state.audience === 'builder' ? builderSections(n) : developerSections(n, active)),
      n.kind === 'element' || n.kind === 'component'
        ? lookSection(
            elementOf(active),
            active.style ?? [],
            await theme(),
            state.audience === 'builder',
            (changes) => {
              active.style = changes
              persist()
              preview(elementOf(active), changes)
              void renderPanel()
            },
          )
        : null,
      requestSection(n, active),
    ]),
  )
}

function renderRequests(list: SavedSummary[]) {
  panel.hidden = false
  panel.replaceChildren(
    h('div', { class: 'head' }, [
      h('div', { class: 'kicker' }, ['.hozu/requests']),
      h('h2', { class: 'title' }, ['Requests']),
      closeButton(() => open(state.picks.length ? 'inspector' : null)),
    ]),
    ...(list.length
      ? [...list]
          .reverse()
          .map((r) =>
            h('button', { class: 'req', type: 'button', onclick: () => open('requests', r.number) }, [
              h('span', { class: 'n' }, [r.number]),
              h('span', { class: 't' }, [r.title]),
              h('span', { class: `s ${r.status}` }, [r.status]),
              r.locations.length ? h('span', { class: 'l' }, [r.locations.join(' · ')]) : null,
            ]),
          )
      : [
          h('div', { class: 'empty' }, [
            h('b', {}, ['No requests yet. ']),
            'Choose Select, click what should change, describe it, then Save request.',
          ]),
        ]),
    h('div', { class: 'tip' }, [
      'Ask your agent: ',
      h('q', {}, ['Do the open Hozu requests.']),
      ' It reads each one, edits at the location and runs the checks.',
    ]),
  )
}

async function renderRequest(number: string) {
  panel.hidden = false
  let r: Awaited<ReturnType<typeof one>>
  try {
    r = await one(number)
  } catch {
    return open('requests')
  }
  const result = h('div', { class: 'status', role: 'status' })
  const outcome = h('input', {
    type: 'text',
    class: 'outcome',
    placeholder: 'What was changed? (optional)',
    'aria-label': 'What was changed',
  }) as HTMLInputElement
  let armed = false
  const del = h(
    'button',
    {
      type: 'button',
      class: 'danger',
      onclick: async () => {
        if (!armed) {
          armed = true
          del.textContent = 'Click again to delete'
          return
        }
        await remove(r.number)
        renderDock()
        open('requests')
      },
    },
    ['Delete'],
  )
  panel.replaceChildren(
    ...present([
      h('div', { class: 'head' }, [
        h('button', { class: 'back', type: 'button', onclick: () => open('requests') }, ['← Requests']),
        h('h2', { class: 'title' }, [r.title]),
        h('div', { class: 'kicker' }, [`${r.number} · ${r.status}${r.result ? ` · ${r.result}` : ''}`]),
        closeButton(() => open(state.picks.length ? 'inspector' : null)),
      ]),
      h('div', { class: 'sec' }, [h('pre', { class: 'md' }, [r.markdown])]),
      h('div', { class: 'sec' }, [
        h('div', { class: 'actions' }, [
          h(
            'button',
            {
              class: 'primary',
              type: 'button',
              onclick: async () => {
                await copy(`Do the Hozu request ${r.file}`)
                status(result, 'ok', [`Copied “Do the Hozu request ${r.file}”.`])
              },
            },
            ['Copy “do this request”'],
          ),
          h(
            'button',
            {
              type: 'button',
              onclick: async () => {
                await copy(r.markdown)
                status(result, 'ok', ['Copied the whole request.'])
              },
            },
            ['Copy request'],
          ),
          del,
        ]),
        r.status === 'open'
          ? h('div', { class: 'finish' }, [
              outcome,
              h(
                'button',
                {
                  type: 'button',
                  onclick: async () => {
                    await finish(r.number, outcome.value.trim() || 'Done')
                    renderDock()
                    open('requests', r.number)
                  },
                },
                ['Mark done'],
              ),
            ])
          : null,
        result,
      ]),
    ]),
  )
}

function renderSettings() {
  panel.hidden = false
  const choice = (value: Audience, label: string, detail: string) =>
    h('label', { class: 'option' }, [
      h('input', {
        type: 'radio',
        name: 'audience',
        checked: state.audience === value,
        onchange: () => {
          state.audience = value
          persist()
          renderDock()
          void renderPanel()
        },
      }),
      h('span', {}, [h('b', {}, [label]), h('span', {}, [detail])]),
    ])
  panel.replaceChildren(
    h('div', { class: 'head' }, [
      h('div', { class: 'kicker' }, ['Hozu DevTools']),
      h('h2', { class: 'title' }, ['Settings']),
      closeButton(() => open(state.picks.length ? 'inspector' : null)),
    ]),
    h('div', { class: 'sec' }, [
      h('div', { class: 'label' }, ['Show']),
      h('fieldset', {}, [
        choice('builder', 'Builder', 'Plain words: what it is, what a change reaches. No code names.'),
        choice(
          'developer',
          'Developer',
          'Files, the code excerpt, components, conditions, transitions and node ids.',
        ),
      ]),
    ]),
    h('div', { class: 'sec' }, [
      h('div', { class: 'label' }, ['Requests']),
      h('label', { class: 'option' }, [
        h('input', {
          type: 'checkbox',
          checked: state.excerpt,
          onchange: (event) => {
            state.excerpt = (event.target as HTMLInputElement).checked
            persist()
          },
        }),
        h('span', {}, [
          h('b', {}, ['Add the code excerpt']),
          h('span', {}, [
            'Seven lines around each place. The agent reads the file anyway, so it is off by default.',
          ]),
        ]),
      ]),
    ]),
    h('div', { class: 'sec' }, [
      h('div', { class: 'label' }, ['Keys']),
      ...[
        ['Alt+Shift+S', 'Select on or off'],
        ['Click', 'Select'],
        ['Shift+click', 'Add to the request'],
        ['Alt+click', 'Select the area around it'],
        ['Double-click', 'Select a text'],
        ['↑ ↓', 'Around it / inside it'],
        ['Esc', 'Back to Browse'],
      ].map(([k, v]) => h('div', { class: 'keyrow' }, [h('kbd', {}, [k!]), v!])),
    ]),
  )
}

renderDock()
drawPicks()
void renderPanel()
requestAnimationFrame(frame)
