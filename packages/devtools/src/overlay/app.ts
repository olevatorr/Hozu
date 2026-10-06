import type { DevLocation, DevNode } from '@hozu/core/ir'
import { type MessageKey, t } from '../messages.ts'
import { describeFor, friendlyName, questionFor } from '../plain.ts'
import {
  type HozuRequest,
  joinRequests,
  labelOf,
  openRequestsLine,
  requestMarkdown,
  type Scope,
  type StyleChange,
  scopesFor,
} from '../prompt.ts'
import { held, hold, node, one, page, remove, save, saved, theme, tree } from './api.ts'
import { assetsBoard, type Catalogued } from './assets.ts'
import { h, read, write } from './dom.ts'
import { drawer } from './effects.ts'
import { previewLabel, renderLayers } from './layers.ts'
import { logo } from './logo.ts'
import { lookSection, preview } from './look.ts'
import { distances, sizeOf } from './measure.ts'
import { agentNotes } from './notes.ts'
import { css, outlineCss } from './style.ts'
import { firstText, previewText, restoreText, type TextChange, textSection } from './text.ts'

interface Pick {
  id: string
  index: number
  note: string
  scope: Scope | null
  visible: string
  style?: StyleChange[]
  text?: TextChange
}

type Audience = 'builder' | 'developer'

interface State {
  mode: 'browse' | 'select'
  picks: Pick[]
  active: number
  panel: 'inspector' | 'changes' | 'settings' | 'layers' | 'notes' | null
  tab: 'draft' | 'saved'
  opened: string | null
  dock: { x: number; y: number } | null
  audience: Audience
  excerpt: boolean
  folded: boolean
  spot: { x: number; y: number } | null
  view: 'overlay' | 'workbench'
  theme: 'system' | 'light' | 'dark'
  device: { name: string; width: number; height: number }
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
  tab: 'draft',
  dock: null,
  audience: given === 'developer' ? 'developer' : 'builder',
  excerpt: false,
  folded: false,
  spot: null,
  view: 'overlay',
  theme: 'system',
  device: { name: 'Phone', width: 390, height: 844 },
  ...read<Partial<State>>(key, {}),
}
const persist = () => write(key, state)

const host = document.createElement('hozu-devtools')
host.setAttribute('data-lenis-prevent', '')
for (const type of ['wheel', 'touchstart', 'touchmove', 'keydown'])
  host.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
const shadow = host.attachShadow({ mode: 'open' })
const root = h('div', { class: 'root' })
const hover = h('div', { class: 'box', hidden: true }, [h('div', { class: 'tag' })])
const boxes = h('div')
const dock = h('div', { class: 'dock', role: 'toolbar', 'aria-label': 'Hozu DevTools' })
const panel = h('div', {
  class: 'panel',
  role: 'dialog',
  'aria-label': t('panel.aria'),
  hidden: true,
})
const bench = h('div', { class: 'bench', hidden: true })
shadow.append(h('style', {}, [css]), root)
const api = drawer({
  plain: () => state.audience === 'builder',
  win: () => win,
  path: () => win.location.pathname,
  resized: () => {
    root.style.setProperty('--api-h', `${api.height()}px`)
    if (state.view === 'workbench') {
      renderBar()
      layout()
    } else renderDock()
  },
  closed: () => {},
})
const screenCookie = 'hozu-dev-preview'
const screenOf = () => {
  const raw = new RegExp(`(?:^|;\\s*)${screenCookie}=([^;]+)`).exec(document.cookie)?.[1]
  try {
    return raw ? decodeURIComponent(raw) : null
  } catch {
    return null
  }
}
const setScreen = (value: string | null) => {
  document.cookie = value
    ? `${screenCookie}=${encodeURIComponent(value)}; path=/; SameSite=Lax`
    : `${screenCookie}=; path=/; max-age=0; SameSite=Lax`
}
const showKey = 'hozu-devtools:assets-show'

function showInstances(c: Catalogued) {
  const here = c.uses.flatMap((u) => [...doc.querySelectorAll(`[data-hz="${CSS.escape(u.node)}"]`)])
  if (!here.length) {
    const page = c.uses.flatMap((u) => u.pages).find((p) => !p.params)
    if (!page) return
    try {
      sessionStorage.setItem(showKey, c.id)
    } catch {}
    win.location.href = page.path
    return
  }
  assets.close()
  state.mode = 'select'
  state.picks = [
    ...state.picks.filter(hasContent),
    ...here.map((el) => ({
      id: el.getAttribute('data-hz') ?? '',
      index: indexOf(el),
      note: '',
      scope: 'component' as const,
      visible: visibleOf(el),
    })),
  ]
  state.active = state.picks.length - 1
  state.panel = 'inspector'
  persist()
  renderDock()
  drawPicks()
  void renderPanel()
}

const assets = assetsBoard({
  plain: state.audience === 'builder',
  theme: () => theme(),
  stylesheets: () =>
    [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href).filter(Boolean),
  show: (c) => showInstances(c),
  change: (c, note) => {
    const first = c.uses[0]
    if (!first) return
    state.picks.push({ id: first.node, index: 0, note, scope: 'component', visible: '' })
    state.active = state.picks.length - 1
    persist()
    assets.close()
    renderDock()
    open('changes', null, 'draft')
  },
  screen: (route, path, name) => {
    setScreen(`${route}:${name}`)
    if (win.location.pathname === path) win.location.reload()
    else win.location.href = path
  },
})

async function screensSection(): Promise<HTMLElement | null> {
  const res = await fetch(`/_hozu/dev/previews?path=${encodeURIComponent(win.location.pathname)}`, {
    cache: 'no-store',
  }).catch(() => null)
  const out = res?.ok
    ? ((await res.json()) as { route: string | null; previews: { name: string }[]; current: string | null })
    : null
  if (!out?.route || !out.previews.length) return null
  return h('div', { class: 'sec' }, [
    h('div', { class: 'label' }, [t('screens.title')]),
    ...out.previews.map((p) => {
      const value = `${out.route}:${p.name}`
      const on = out.current === value
      return h('div', { class: 'look' }, [
        h('span', { class: 'what' }, [p.name]),
        h(
          'button',
          {
            class: on ? 'link done' : 'link',
            type: 'button',
            onclick: () => {
              setScreen(on ? null : value)
              win.location.reload()
            },
          },
          [t(on ? 'screens.exit' : 'screens.preview')],
        ),
      ])
    }),
  ])
}

root.append(bench, panel, dock, api.el, assets.board)
try {
  const pending = sessionStorage.getItem(showKey)
  if (pending) {
    sessionStorage.removeItem(showKey)
    void assets.catalog().then((list) => {
      const c = list?.find((x) => x.id === pending)
      if (c) setTimeout(() => showInstances(c), 300)
    })
  }
} catch {}
document.documentElement.append(host)

const darkScheme = matchMedia('(prefers-color-scheme: dark)')
function applyTheme() {
  root.dataset.theme = state.theme === 'system' ? (darkScheme.matches ? 'dark' : 'light') : state.theme
}
darkScheme.addEventListener('change', applyTheme)
applyTheme()

let doc: Document = document
let win: Window = window
let frameEl: HTMLIFrameElement | null = null
const frames = h('div')
let outline: HTMLElement | null = null
let measuring = false
const measure = h('div', { class: 'measure', hidden: true })
const agent = agentNotes({
  doc: () => doc,
  win: () => win,
  developer: () => state.audience === 'developer',
  show: () => open('notes'),
  closeButton: (onclick) => closeButton(onclick),
  close: () => open(state.picks.length ? 'inspector' : null),
  changed: () => {
    renderDock()
    if (state.panel === 'notes') void renderPanel()
  },
})

function mountOutline(target: Document) {
  outline?.remove()
  const el = target.createElement('hozu-devtools-outline')
  el.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646'
  el.attachShadow({ mode: 'open' }).append(
    h('style', {}, [outlineCss]),
    frames,
    boxes,
    agent.layer,
    hover,
    measure,
  )
  target.documentElement.append(el)
  outline = el
}
mountOutline(document)

const frameOf = new WeakMap<HTMLElement, HTMLElement>()
const framed = (box: HTMLElement, selected: boolean) => {
  const frame = h('div', { class: selected ? 'frame selected' : 'frame', hidden: true })
  frames.append(frame)
  frameOf.set(box, frame)
  return box
}
framed(hover, false)

const ours = (event: Event) =>
  event.composedPath().includes(host) || (outline !== null && event.composedPath().includes(outline))
const parentId = (id: string) => id.slice(0, id.lastIndexOf('/'))
const isText = (n: DevNode | null) => n?.kind === 'text'

function elementOf(pick: { id: string; index: number }): Element | null {
  const all = doc.querySelectorAll(`[data-hz="${CSS.escape(pick.id)}"]`)
  if (all.length) return all[Math.min(pick.index, all.length - 1)] ?? null
  return pick.id.includes('/') ? elementOf({ id: parentId(pick.id), index: pick.index }) : null
}

function indexOf(el: Element): number {
  const id = el.getAttribute('data-hz') ?? ''
  return [...doc.querySelectorAll(`[data-hz="${CSS.escape(id)}"]`)].indexOf(el)
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
    target.style.left = `${r.left - 2}px`
    target.style.top = `${r.top - 2}px`
    target.style.width = `${r.width + 4}px`
    target.style.height = `${r.height + 4}px`
  }
  const size = box.querySelector<HTMLElement>(':scope > .size')
  if (size) size.textContent = sizeOf(r)
  const tag = box.firstElementChild as HTMLElement | null
  if (!tag?.classList.contains('tag')) return
  tag.style.left = ''
  const below = r.top < 28 || r.top - tag.offsetHeight - 8 < 0
  box.classList.toggle('below', below)
  const view = win.innerWidth
  const overflow = r.left - 3 + tag.offsetWidth - (view - 4)
  tag.style.left =
    overflow > 0 ? `${Math.max(-r.left + 4, -1 - overflow)}px` : r.left < 2 ? `${2 - r.left}px` : ''
}

let hovered: Element | null = null

function tagText(n: DevNode | null, el: Element): (Node | string)[] {
  if (!n) return [el.tagName.toLowerCase()]
  if (state.audience === 'builder')
    return [
      friendlyName(n),
      n.component && n.component.uses > 1
        ? h('b', {}, [`  ${t('hover.shared', { count: n.component.uses })}`])
        : '',
    ]
  return [
    h('b', {}, [n.kind === 'element' ? '' : `${n.kind} `]),
    labelOf(n),
    n.location ? `  ${n.location.file}:${n.location.line}` : '',
  ]
}

let forced = false

async function showHover(el: Element | null, force = false) {
  hovered = el
  forced = force
  if (!el || (state.mode !== 'select' && !force)) {
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

function drawMeasure() {
  const active = state.picks[state.active]
  const from = active ? elementOf(active) : hovered
  const to = active ? hovered : (hovered?.parentElement?.closest('[data-hz]') ?? null)
  if (!measuring || state.mode !== 'select' || !from || !to || from === to) {
    measure.hidden = true
    return
  }
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const px = (n: number) => `${n}px`
  const target = h('div', { class: 'm-target' })
  Object.assign(target.style, { left: px(b.left), top: px(b.top), width: px(b.width), height: px(b.height) })
  const parts: HTMLElement[] = [target]
  for (const l of distances(a, b)) {
    const line = h('div', { class: `m-line ${l.axis}` })
    const label = h('div', { class: 'm-label' }, [String(Math.round(l.to - l.from))])
    const mid = (l.from + l.to) / 2
    if (l.axis === 'h') {
      Object.assign(line.style, { left: px(l.from), top: px(l.at), width: px(l.to - l.from) })
      Object.assign(label.style, { left: px(mid), top: px(l.at) })
    } else {
      Object.assign(line.style, { left: px(l.at), top: px(l.from), height: px(l.to - l.from) })
      Object.assign(label.style, { left: px(l.at), top: px(mid) })
    }
    parts.push(line, label)
  }
  measure.replaceChildren(...parts)
  measure.hidden = false
}

function drawPicks() {
  for (const p of state.picks) {
    preview(elementOf(p), p.style ?? [])
    previewText(elementOf(p), p.text)
  }
  for (const box of boxes.children) frameOf.get(box as HTMLElement)?.remove()
  boxes.replaceChildren(
    ...state.picks.map((p, i) => {
      const box = framed(
        h('div', { class: 'box selected' }, [
          state.picks.length > 1 ? h('div', { class: 'badge' }, [String(i + 1)]) : null,
          h('div', { class: 'size' }),
        ]),
        true,
      )
      place(box, state.mode === 'select' ? elementOf(p) : null)
      return box
    }),
  )
}

function frame() {
  if (state.picks.length) {
    let i = 0
    for (const box of boxes.children) {
      const p = state.picks[i++]
      if (p && state.mode === 'select') place(box as HTMLElement, elementOf(p))
      else place(box as HTMLElement, null)
    }
  }
  if (hovered && (state.mode === 'select' || forced)) place(hover, hovered)
  drawMeasure()
  agent.frame()
  requestAnimationFrame(frame)
}

const hasContent = (p: Pick) => p.note.trim() !== '' || (p.style?.length ?? 0) > 0 || !!p.text
const drafted = () => state.picks.filter(hasContent)

function select(pick: Omit<Pick, 'note' | 'scope'>, add: boolean) {
  const same = (p: Pick) => p.id === pick.id && p.index === pick.index
  if (!add) state.picks = state.picks.filter((p) => hasContent(p) || same(p))
  const existing = state.picks.findIndex(same)
  if (existing >= 0) state.active = existing
  else {
    state.picks.push({ ...pick, note: '', scope: null })
    state.active = state.picks.length - 1
  }
  state.panel = 'inspector'
  persist()
  drawPicks()
  void renderPanel()
}

function markedFrom(event: Event): Element | null {
  for (const target of event.composedPath())
    if (target !== host && (target as Element).nodeType === 1 && (target as Element).hasAttribute('data-hz'))
      return target as Element
  return null
}

async function selectText(event: MouseEvent) {
  const el = markedFrom(event)
  if (!el) return
  const n = await node(el.getAttribute('data-hz') ?? '')
  const texts = n?.children.filter((c) => c.kind === 'text') ?? []
  if (!n || !texts.length) return
  const caret = doc.caretPositionFromPoint?.(event.clientX, event.clientY)?.offsetNode
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
function listen(target: Window): AbortController {
  const stop = new AbortController()
  const signal = stop.signal
  for (const type of blocked)
    target.addEventListener(
      type,
      (event) => {
        if (state.mode !== 'select' || ours(event)) return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (type === 'dblclick') void selectText(event as MouseEvent)
        if (type !== 'click') return
        const mouse = event as MouseEvent
        const clicked = markedFrom(event)
        const el = clicked
        if (!el) return
        select(
          { id: el.getAttribute('data-hz') ?? '', index: indexOf(el), visible: visibleOf(el) },
          mouse.shiftKey,
        )
      },
      { capture: true, signal },
    )
  target.addEventListener(
    'pointermove',
    (event) => {
      measuring = event.altKey
      if (state.mode !== 'select') return
      const el = ours(event) ? null : markedFrom(event)
      if (el !== hovered) void showHover(el)
    },
    { capture: true, passive: true, signal },
  )
  target.addEventListener('keydown', onKey, { capture: true, signal })
  target.addEventListener(
    'keyup',
    (event) => {
      measuring = event.altKey
    },
    { capture: true, signal },
  )
  target.addEventListener(
    'blur',
    () => {
      measuring = false
    },
    { signal },
  )
  return stop
}

/** The marked parts directly inside `parent` (or the page), in document order. */
function partsIn(parent: Element | null): Element[] {
  const all = [...(parent ?? doc).querySelectorAll('[data-hz]')]
  return all.filter((e) => (e.parentElement?.closest('[data-hz]') ?? null) === parent)
}

function walk(direction: 'up' | 'down' | 'next' | 'previous') {
  const active = state.picks[state.active]
  if (!active) return
  const el = elementOf(active)
  const own = el?.getAttribute('data-hz') === active.id
  const beside = () => {
    if (!el || !own) return null
    const list = partsIn(el.parentElement?.closest('[data-hz]') ?? null).filter((e) => {
      const b = e.getBoundingClientRect()
      return e === el || (b.width > 0 && b.height > 0)
    })
    const at = list.indexOf(el)
    return list[(at + (direction === 'next' ? 1 : -1) + list.length) % list.length] ?? null
  }
  const next =
    direction === 'up'
      ? own
        ? el?.parentElement?.closest('[data-hz]')
        : el
      : direction === 'down'
        ? own
          ? el?.querySelector('[data-hz]')
          : null
        : beside()
  if (!next || ((direction === 'next' || direction === 'previous') && next === el)) return
  const moved = { id: next.getAttribute('data-hz') ?? '', index: indexOf(next), visible: visibleOf(next) }
  if (hasContent(active)) {
    const existing = state.picks.findIndex((p) => p.id === moved.id && p.index === moved.index)
    if (existing >= 0) state.active = existing
    else {
      state.picks.push({ ...moved, note: '', scope: null })
      state.active = state.picks.length - 1
    }
  } else {
    preview(el, [])
    state.picks[state.active] = { ...moved, note: '', scope: null }
  }
  persist()
  drawPicks()
  void renderPanel()
}

function setMode(mode: State['mode']) {
  state.mode = mode
  if (mode === 'select') state.folded = false
  if (mode === 'browse') void showHover(null)
  persist()
  renderDock()
}

const typingIn = (event: KeyboardEvent) =>
  event.composedPath().some((t) => ['TEXTAREA', 'INPUT', 'SELECT'].includes((t as Element).tagName))

function onKey(event: KeyboardEvent) {
  const typing = typingIn(event)
  if (event.key === 'Escape' && assets.isOpen()) return assets.close()
  if (event.altKey && event.shiftKey && event.code === 'KeyS') {
    event.preventDefault()
    return setMode(state.mode === 'select' ? 'browse' : 'select')
  }
  if (typing) return
  if (event.key === 'Escape' && bench.classList.contains('layers-open')) return closeLayers()
  if (event.key === 'Escape' && state.mode === 'select') return setMode('browse')
  if (event.key === 'Escape' && state.panel) {
    state.panel = null
    persist()
    return void renderPanel()
  }
  if (event.key === 'Alt') {
    measuring = true
    if (state.mode === 'select') event.preventDefault()
    return
  }
  if (state.mode !== 'select' || !state.picks.length || event.composedPath().includes(host)) return
  const step =
    event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey)
      ? 'up'
      : event.key === 'ArrowDown' || event.key === 'Enter'
        ? 'down'
        : event.key === 'Tab'
          ? event.shiftKey
            ? 'previous'
            : 'next'
          : null
  if (!step) return
  event.preventDefault()
  walk(step)
}

let listening = listen(window)
const reload = () => win.location.reload()

function layersHost(close: () => void) {
  return {
    plain: state.audience === 'builder',
    shown: (id: string) => doc.querySelector(`[data-hz="${CSS.escape(id)}"]`),
    hover: (el: Element | null) => void showHover(el, true),
    pick: (id: string, el: Element) => {
      void showHover(null)
      select({ id, index: indexOf(el), visible: visibleOf(el) }, false)
    },
    hold: (p: Parameters<typeof hold>[0]) => hold(p, reload),
    close,
  }
}

function renderDock() {
  dock.hidden = state.view === 'workbench'
  if (state.view === 'workbench') return renderBar()
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
  const grip = h(
    'div',
    {
      class: 'grip',
      role: 'button',
      tabindex: '0',
      'aria-expanded': String(!state.folded),
      'aria-label': t(state.folded ? 'dock.open' : 'dock.fold'),
      title: t('dock.grip'),
      onkeydown: (e) => {
        const key = (e as KeyboardEvent).key
        if (key === 'Enter' || key === ' ') {
          e.preventDefault()
          fold()
        }
      },
    },
    [h('img', { src: logo, alt: '', width: '20', height: '20', draggable: 'false' })],
  )
  dock.classList.toggle('folded', state.folded)
  if (state.folded) {
    dock.replaceChildren(grip)
    placeDock()
    return
  }
  dock.replaceChildren(
    ...present([
      grip,
      h('div', { class: 'seg' }, [button(t('dock.browse'), 'browse'), button(t('dock.select'), 'select')]),
      agent.count()
        ? h(
            'button',
            {
              class: 'act agent',
              type: 'button',
              title: t('dock.agent.title'),
              'aria-pressed': String(state.panel === 'notes'),
              onclick: () => {
                if (state.panel === 'notes') return open(state.picks.length ? 'inspector' : null)
                open('notes')
                agent.focus()
              },
            },
            [t('dock.agent'), h('span', { class: 'agent-count' }, [String(agent.count())])],
          )
        : null,
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          onclick: () => {
            if (state.panel === 'changes') open(state.picks.length ? 'inspector' : null)
            else open('changes', null, drafted().length ? 'draft' : 'saved')
          },
        },
        [t('dock.changes'), h('span', { class: 'count', 'data-count': true })],
      ),
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          title: t('dock.page.title'),
          onclick: async () => {
            const n = await page(win.location.pathname)
            if (n)
              select(
                { id: n.id, index: 0, visible: doc.title },
                state.mode === 'select' && state.picks.length > 0,
              )
          },
        },
        [t('dock.page')],
      ),
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          title: t('dock.layers.title'),
          onclick: () => {
            state.panel = state.panel === 'layers' ? (state.picks.length ? 'inspector' : null) : 'layers'
            persist()
            void renderPanel()
          },
        },
        [t('dock.layers')],
      ),
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          title: t('dock.assets.title'),
          onclick: () => void assets.open(),
        },
        [t('dock.assets')],
      ),
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          title: t('dock.api.title'),
          'aria-pressed': api.isOpen() ? 'true' : 'false',
          onclick: () => api.toggle(),
        },
        [t('dock.api')],
      ),
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          title: t('dock.frame.title'),
          onclick: () => {
            state.panel = state.picks.length ? 'inspector' : null
            openBench()
          },
        },
        [t('dock.frame')],
      ),
      h(
        'button',
        {
          class: 'act gear',
          type: 'button',
          title: t('dock.settings'),
          'aria-label': t('dock.settings'),
          onclick: () => {
            state.panel = state.panel === 'settings' ? (state.picks.length ? 'inspector' : null) : 'settings'
            persist()
            void renderPanel()
          },
        },
        ['⚙'],
      ),
      screenOf()
        ? h(
            'button',
            {
              class: 'previewing',
              type: 'button',
              title: t('dock.screen.exit'),
              onclick: () => {
                setScreen(null)
                win.location.reload()
              },
            },
            [
              t('dock.screen', { name: screenOf()!.slice(screenOf()!.indexOf(':') + 1) }),
              ` · ${t('dock.exit')}`,
            ],
          )
        : null,
      held()
        ? h(
            'button',
            {
              class: 'previewing',
              type: 'button',
              title: t('dock.preview.exit'),
              onclick: () => hold(null, reload),
            },
            [h('span', { 'data-preview': true }, [t('dock.preview')]), ` · ${t('dock.exit')}`],
          )
        : null,
      state.mode === 'select' && !held() && !state.panel
        ? h('div', { class: 'tip', role: 'note' }, [
            h('span', {}, inline(t('tip.click'), 'key', h('kbd', {}, ['Click']))),
            h('span', {}, inline(t('tip.shift'), 'key', h('kbd', {}, ['Shift']))),
            h('span', {}, inline(t('tip.parent'), 'key', h('kbd', {}, ['⇧ Enter']))),
            h('span', {}, inline(t('tip.measure'), 'key', h('kbd', {}, ['Alt']))),
            h('span', {}, inline(t('tip.stop'), 'key', h('kbd', {}, ['Esc']))),
          ])
        : null,
    ]),
  )
  const holding = held()
  if (holding)
    void tree(win.location.pathname).then((found) => {
      const label = dock.querySelector('[data-preview]')
      if (label) label.textContent = t('dock.preview.named', { name: previewLabel(found, holding) })
    })
  const count = dock.querySelector('[data-count]')
  if (count) count.textContent = drafted().length ? String(drafted().length) : ''
  placeDock()
}

function placeDock() {
  const r = dock.getBoundingClientRect()
  const x = state.dock
    ? Math.max(8, Math.min(state.dock.x, innerWidth - r.width - 8))
    : (innerWidth - r.width) / 2
  const y = state.dock
    ? Math.max(8, Math.min(state.dock.y, innerHeight - r.height - 8))
    : innerHeight - r.height - 24 - api.height()
  dock.style.left = `${x}px`
  dock.style.top = `${y}px`
  dock.classList.toggle('near-top', y < 64)
}

function fold() {
  state.folded = !state.folded
  if (state.folded) {
    state.mode = 'browse'
    state.panel = null
    void showHover(null)
    void renderPanel()
  }
  persist()
  renderDock()
}

dock.addEventListener('pointerdown', (event) => {
  if (!(event.target as Element).closest('.grip')) return
  const r = dock.getBoundingClientRect()
  const dx = event.clientX - r.left
  const dy = event.clientY - r.top
  let moved = false
  const move = (e: PointerEvent) => {
    if (!moved && Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) < 4) return
    moved = true
    state.dock = { x: e.clientX - dx, y: e.clientY - dy }
    placeDock()
  }
  const up = () => {
    if (moved) persist()
    else fold()
    removeEventListener('pointermove', move)
    removeEventListener('pointerup', up)
  }
  addEventListener('pointermove', move)
  addEventListener('pointerup', up)
})
addEventListener('resize', placeDock)

function placePanel() {
  if (state.view === 'workbench' || !state.spot) {
    panel.style.left = panel.style.top = panel.style.right = ''
    return
  }
  const r = panel.getBoundingClientRect()
  const x = Math.min(Math.max(0, state.spot.x), innerWidth - Math.min(r.width, innerWidth))
  const y = Math.min(Math.max(0, state.spot.y), innerHeight - 48)
  panel.style.right = 'auto'
  panel.style.left = `${x}px`
  panel.style.top = `${y}px`
}

panel.addEventListener('pointerdown', (event) => {
  const target = event.target as Element
  if (
    state.view === 'workbench' ||
    !target.closest('.head') ||
    target.closest('button, input, select, textarea, a')
  )
    return
  event.preventDefault()
  const head = target.closest('.head') as HTMLElement
  head.setPointerCapture(event.pointerId)
  const r = panel.getBoundingClientRect()
  const dx = event.clientX - r.left
  const dy = event.clientY - r.top
  const move = (e: PointerEvent) => {
    state.spot = { x: e.clientX - dx, y: e.clientY - dy }
    placePanel()
  }
  const up = () => {
    persist()
    head.removeEventListener('pointermove', move)
    head.removeEventListener('pointerup', up)
  }
  head.addEventListener('pointermove', move)
  head.addEventListener('pointerup', up)
})
panel.addEventListener('dblclick', (event) => {
  const target = event.target as Element
  if (!target.closest('.head') || target.closest('button, input, select, textarea, a')) return
  state.spot = null
  persist()
  placePanel()
})
addEventListener('resize', placePanel)

const where = (what: string, l: DevLocation | null) =>
  l
    ? h('div', { class: 'loc' }, [
        h('span', { class: 'what' }, [what]),
        h('span', {}, [`${l.file}:${l.line}:${l.column}`]),
        h(
          'button',
          {
            type: 'button',
            title: t('inspector.copyLocation'),
            onclick: () => void copy(`${l.file}:${l.line}:${l.column}`),
          },
          [t('inspector.copy')],
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

const kindTitle: Record<string, MessageKey> = {
  element: 'kind.element',
  component: 'kind.component',
  text: 'kind.text',
  query: 'kind.query',
  when: 'kind.when',
  if: 'kind.if',
  list: 'kind.list',
  html: 'kind.html',
  embed: 'kind.embed',
  other: 'kind.other',
}

const kindOf = (kind: string) => (kindTitle[kind] ? t(kindTitle[kind]!) : kind)

const inline = (text: string, name: string, node: Node): (Node | string)[] => {
  const [before, after] = text.split(`{${name}}`)
  return after === undefined ? [text] : [before || null, node, after || null].filter((x) => x !== null)
}

function kicker(n: DevNode) {
  if (state.audience === 'builder')
    return n.page
      ? t('inspector.kicker.page', { path: n.page.path })
      : t('inspector.kicker.on', { path: win.location.pathname })
  const kind = n.component
    ? t('kind.component')
    : n.kind === 'text' && n.source?.kind === 'data'
      ? t('kind.dataText')
      : kindOf(n.kind)
  if (n.page) return t('inspector.kicker.route', { path: n.page.path })
  return t('inspector.kicker.view', { kind, view: `${n.owner?.feature}.${n.owner?.view}` })
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
          : kindOf(n.kind),
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
      (source.uses ?? 1) > 1
        ? h('span', { class: 'warn' }, [` · ${t('inspector.sharedBy', { count: source.uses! })}`])
        : null,
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
    const done = document.execCommand('copy')
    area.remove()
    if (!done) throw new Error('the browser did not allow copying')
  }
}

/** Starts the clipboard write inside the click, for text that is still being prepared (Safari ends the gesture). */
function copyLater(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write)
    return navigator.clipboard
      .write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })])
      .catch(async () => copy(await text))
  return text.then(copy)
}

async function request(): Promise<HozuRequest> {
  const active = state.picks[state.active]
  const chosen = drafted().length ? drafted() : active ? [active] : []
  const nodes = await Promise.all(chosen.map((p) => node(p.id)))
  return {
    items: chosen.flatMap((p, i) => {
      const n = nodes[i]
      return n
        ? [
            {
              node: n,
              note: p.note,
              scope: p.scope ?? scopesFor(n)[0]!.scope,
              visible: p.visible,
              style: p.style ?? [],
              ...(p.text ? { text: p.text } : {}),
            },
          ]
        : []
    }),
    context: {
      path: win.location.pathname + win.location.search,
      viewport: { width: win.innerWidth, height: win.innerHeight },
      preview: held() ? previewLabel(await tree(win.location.pathname), held()!) : null,
    },
  }
}

function status(el: HTMLElement, kind: 'ok' | 'err', parts: (Node | string)[]) {
  el.className = `status ${kind}`
  el.replaceChildren(...parts)
}

const open = (panelName: State['panel'], opened: string | null = null, tab: State['tab'] = state.tab) => {
  state.panel = panelName
  state.opened = opened
  state.tab = tab
  persist()
  void renderPanel()
}

const closeButton = (onclick: () => void) =>
  h('button', { class: 'close', type: 'button', 'aria-label': t('common.close'), onclick }, ['×'])

function choose(active: Pick, id: string, visible: string) {
  state.picks[state.active] = { ...active, id, scope: null, visible }
  persist()
  drawPicks()
  void renderPanel()
}

function removeActive() {
  const gone = state.picks[state.active]
  if (gone) preview(elementOf(gone), [])
  if (gone) restoreText(elementOf(gone), gone.text)
  state.picks.splice(state.active, 1)
  state.active = Math.max(0, state.active - 1)
  if (!state.picks.length) state.panel = null
  persist()
  drawPicks()
  void renderPanel()
}

function scopeLabel(n: DevNode, scope: Scope) {
  const c = n.component
  if (scope === 'component' && c)
    return t(c.uses === 1 ? 'scope.component.one' : 'scope.component.other', {
      name: c.ref.split('.').pop() ?? '',
      count: c.uses,
    })
  if (scope === 'items') return t('scope.items')
  if (n.conditions.some((x) => x.kind === 'each')) return t('scope.thisItem')
  return t(c ? 'scope.instance' : 'scope.thisOne')
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
        asked?.options[s.scope] ?? scopeLabel(n, s.scope),
      ]),
    ),
  ])
}

let notice: (Node | string)[] | null = null

function clearDraft() {
  for (const p of state.picks) {
    preview(elementOf(p), [])
    restoreText(elementOf(p), p.text)
  }
  state.picks = []
  state.active = 0
  persist()
  drawPicks()
}

function exportBlock() {
  const count = (drafted().length || (state.picks[state.active] ? 1 : 0)) as number
  const result = h('div', { class: 'status', role: 'status' })
  const draft = h('textarea', {
    class: 'draft',
    'aria-label': t('export.draft'),
    hidden: true,
  }) as HTMLTextAreaElement
  const generate = async () =>
    requestMarkdown(await request(), { excerpt: state.excerpt, theme: await theme() })
  const markdown = async () => (draft.hidden ? generate() : draft.value)
  const edit = h(
    'button',
    {
      class: 'link',
      type: 'button',
      onclick: async () => {
        if (draft.hidden) draft.value = await generate()
        draft.hidden = !draft.hidden
        edit.textContent = t(draft.hidden ? 'export.edit' : 'export.discard')
      },
    },
    [t('export.edit')],
  )
  const many = count > 1
  let stored: { text: string; done: Promise<{ number: string; file: string }> } | null = null
  const saveOnce = async (text: string): Promise<{ number: string; file: string }> => {
    if (stored?.text === text) {
      const kept = await stored.done.catch(() => null)
      if (
        kept &&
        (await one(kept.number).then(
          () => true,
          () => false,
        ))
      )
        return kept
    }
    const current = { text, done: save(text) }
    stored = current
    return current.done.catch((e) => {
      if (stored === current) stored = null
      throw e
    })
  }
  return h('div', { class: 'export' }, [
    h('div', { class: 'row-end' }, [edit]),
    draft,
    h('div', { class: 'actions' }, [
      h(
        'button',
        {
          class: 'primary',
          type: 'button',
          onclick: async () => {
            const job = markdown().then(async (text) => {
              try {
                const done = await saveOnce(text)
                return {
                  text: `${text}\n\nSaved as ${done.file}. When it is done: npx hozu requests done ${done.number} --result "<what changed>"\n`,
                  done,
                  error: null,
                }
              } catch (e) {
                return { text, done: null, error: (e as Error).message }
              }
            })
            try {
              await copyLater(job.then((j) => j.text))
            } catch (e) {
              status(result, 'err', [t('export.notCopied', { error: (e as Error).message })])
              return
            }
            const { done, error } = await job
            if (done)
              status(result, 'ok', [
                t(count === 1 ? 'export.copiedSaved.one' : 'export.copiedSaved.other', {
                  count,
                  file: done.file,
                }),
              ])
            else status(result, 'err', [t('export.copiedNotSaved', { error: error ?? '' })])
          },
        },
        [many ? t('export.copy.many', { count }) : t('export.copy')],
      ),
      h(
        'button',
        {
          type: 'button',
          onclick: async () => {
            try {
              const saving = markdown().then(saveOnce)
              await copyLater(saving.then((d) => `Do the Hozu request ${d.file}`))
              const done = await saving
              const ask = `Do the Hozu request ${done.file}`
              notice = inline(t('export.saved', { ask }), 'file', h('code', {}, [done.file]))
              clearDraft()
              renderDock()
              open('changes', null, 'saved')
            } catch (e) {
              status(result, 'err', [t('export.notSaved', { error: (e as Error).message })])
            }
          },
        },
        [many ? t('export.save.many', { count }) : t('export.save')],
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
            status(result, 'ok', [t('export.downloaded', { file: 'hozu-request.md' })])
          },
        },
        [t('export.download')],
      ),
    ]),
    result,
  ])
}

function textFor(n: DevNode, active: Pick) {
  const from =
    active.text?.from ?? (n.kind === 'text' ? active.visible || null : firstText(elementOf(active)))
  if (!from || n.page) return null
  return textSection(from, active.text, state.audience === 'builder', (change) => {
    const had = hasContent(active)
    restoreText(elementOf(active), active.text)
    if (change) active.text = change
    else delete active.text
    previewText(elementOf(active), active.text)
    persist()
    if (had !== hasContent(active)) renderDock()
    void renderPanel()
  })
}

function requestSection(n: DevNode, active: Pick) {
  const others = state.picks.filter((p) => p !== active && hasContent(p)).length
  const note = h('textarea', {
    'aria-label': t('change.aria'),
    placeholder: t('change.placeholder'),
    oninput: (event) => {
      const had = hasContent(active)
      active.note = (event.target as HTMLTextAreaElement).value
      persist()
      if (had !== hasContent(active)) renderDock()
    },
  }) as HTMLTextAreaElement
  note.value = active.note
  return h('div', { class: 'sec' }, [
    h('div', { class: 'label' }, [t('change.label')]),
    scopeField(n, active),
    note,
    others
      ? h('div', { class: 'plain more' }, [
          t(others === 1 ? 'change.others.one' : 'change.others.other', { count: others }),
          h('button', { class: 'link', type: 'button', onclick: () => open('changes', null, 'draft') }, [
            t('change.review'),
          ]),
        ])
      : h('div', { class: 'hint-text' }, [t('change.hint')]),
    exportBlock(),
  ])
}

function builderSections(n: DevNode) {
  const children = n.children.filter((c) => c.kind !== 'text')
  return [
    section(t('inspector.about'), [
      ...describeFor(n).map((line) => h('div', { class: 'plain' }, [line])),
      n.component?.client
        ? h('div', { class: 'plain' }, [t('plain.about.client', { file: n.component.client.file })])
        : null,
    ]),
    h('div', { class: 'sec' }, [
      h('div', { class: 'nav' }, [
        h('button', { type: 'button', onclick: () => walk('up') }, [t('inspector.around')]),
        children.length && !isText(n) && !n.component?.client
          ? h('button', { type: 'button', onclick: () => walk('down') }, [t('inspector.inside')])
          : null,
        h('button', { type: 'button', onclick: removeActive }, [t('inspector.remove')]),
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
              [t('inspector.copy')],
            ),
          ])
        : null,
    ]),
  ]
}

function developerSections(n: DevNode, active: Pick) {
  const children = n.children.filter((c) => c.kind !== 'text' || c.text)
  return [
    section(t('inspector.where'), [
      where(t(n.page ? 'inspector.where.page' : 'inspector.where.view'), n.location),
      n.page ? where(t('inspector.where.route'), n.page.routeLocation) : null,
      n.component ? where(t('inspector.where.component'), n.component.declaration) : null,
      n.events.length ? where(t('inspector.where.machine'), n.machine) : null,
      excerpt(n),
    ]),
    section(
      t('inspector.component'),
      n.component
        ? [
            h('div', {}, [
              h('span', { class: 'chip red' }, [n.component.ref]),
              h('span', { class: 'chip' }, [
                t(n.component.uses === 1 ? 'inspector.usedIn.one' : 'inspector.usedIn.other', {
                  count: n.component.uses,
                }),
              ]),
              ...Object.entries(n.component.variant).map(([k, v]) =>
                h('span', { class: 'chip' }, [`${k}=${v}`]),
              ),
            ]),
            n.component.client
              ? h('div', { class: 'plain' }, [t('inspector.client', { file: n.component.client.file })])
              : null,
          ]
        : [],
    ),
    section(
      t('inspector.head'),
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
    section(t('inspector.text'), textRows(n)),
    section(
      t('inspector.shownWhen'),
      n.conditions.map((c) =>
        h('div', { class: 'row' }, [
          h('b', {}, [`${c.kind} `]),
          c.detail,
          c.location ? `  ${c.location.file}:${c.location.line}` : '',
        ]),
      ),
    ),
    section(
      t('inspector.behaviour'),
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
    section(t('inspector.insideIt'), [
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
        h('button', { type: 'button', onclick: () => walk('up') }, [t('inspector.parent')]),
        isText(n) || n.component?.client
          ? null
          : h('button', { type: 'button', onclick: () => walk('down') }, [t('inspector.child')]),
        h('button', { type: 'button', onclick: removeActive }, [t('inspector.remove')]),
      ]),
    ]),
    h('div', { class: 'sec meta' }, [`node ${n.id}`, n.pointer ? ` · ${n.pointer}` : '']),
  ]
}

async function renderPanel() {
  dock.querySelector('.tip')?.toggleAttribute('hidden', !!state.panel)
  placePanel()
  if (state.panel === 'changes') return state.opened ? renderRequest(state.opened) : renderChanges()
  if (state.panel === 'settings') return renderSettings()
  if (state.panel === 'notes') return agent.render(panel)
  if (state.panel === 'layers') {
    await renderLayers(
      panel,
      await tree(win.location.pathname),
      layersHost(() => open(state.picks.length ? 'inspector' : null)),
    )
    const screens = await screensSection()
    if (screens) panel.append(screens)
    return
  }
  const active = state.picks[state.active]
  if (state.panel !== 'inspector' || !active) {
    panel.hidden = state.view !== 'workbench'
    if (state.view === 'workbench')
      panel.replaceChildren(
        h('div', { class: 'empty' }, [h('b', {}, [t('inspector.empty.title')]), t('inspector.empty.text')]),
      )
    return
  }
  const n = await node(active.id)
  if (!n) {
    panel.hidden = false
    panel.replaceChildren(
      h('div', { class: 'empty' }, [h('b', {}, [t('inspector.gone.title')]), t('inspector.gone.text')]),
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
      textFor(n, active),
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

function tabs(current: 'draft' | 'saved', saved: number) {
  const tab = (name: 'draft' | 'saved', label: string) =>
    h(
      'button',
      {
        class: 'tab',
        type: 'button',
        'aria-pressed': String(current === name),
        onclick: () => open('changes', null, name),
      },
      [label],
    )
  return h('div', { class: 'tabs' }, [
    tab('draft', t('changes.tab.draft', { count: drafted().length })),
    tab('saved', t('changes.tab.saved', { count: saved })),
  ])
}

async function renderChanges() {
  const list = await saved()
  const current = state.tab
  panel.hidden = false
  const head = h('div', { class: 'head' }, [
    h('div', { class: 'kicker' }, [current === 'draft' ? t('changes.notSent') : '.hozu/requests']),
    h('h2', { class: 'title' }, [t('changes.title')]),
    closeButton(() => open(state.picks.length ? 'inspector' : null)),
    tabs(current, list.length),
  ])
  if (current === 'saved') {
    const message = notice
    notice = null
    const result = h('div', { class: 'status', role: 'status' })
    const row = (r: (typeof list)[number]) => {
      let armed = false
      const done = h(
        'button',
        {
          class: 'link done',
          type: 'button',
          title: t('changes.resolve.title'),
          onclick: async () => {
            if (!armed) {
              armed = true
              done.textContent = t('changes.resolve.confirm')
              return
            }
            await remove(r.number)
            void renderPanel()
          },
        },
        [t('changes.resolve')],
      )
      return h('div', { class: 'req' }, [
        h('span', { class: 'n' }, [r.number]),
        h(
          'button',
          { class: 't open-req', type: 'button', onclick: () => open('changes', r.number, 'saved') },
          [r.title],
        ),
        done,
        r.locations.length ? h('span', { class: 'l' }, [r.locations.join(' · ')]) : null,
      ])
    }
    panel.replaceChildren(
      ...present([
        head,
        message ? h('div', { class: 'notice' }, message) : null,
        ...(list.length
          ? [...list].reverse().map(row)
          : [h('div', { class: 'empty' }, [t('changes.noRequests')])]),
        list.length
          ? h('div', { class: 'sec' }, [
              h('div', { class: 'choice' }, [
                h(
                  'button',
                  {
                    class: 'primary',
                    type: 'button',
                    onclick: async () => {
                      const full = await Promise.all(list.map((r) => one(r.number)))
                      await copy(joinRequests(full))
                      status(result, 'ok', [t('changes.copiedAll', { count: list.length })])
                    },
                  },
                  [t('changes.copyAll', { count: list.length })],
                ),
                h('span', { class: 'why' }, [t('changes.copyAll.why')]),
                h(
                  'button',
                  {
                    type: 'button',
                    onclick: async () => {
                      await copy(openRequestsLine(list))
                      status(result, 'ok', [t('changes.copiedPaths')])
                    },
                  },
                  [t('changes.copyPaths')],
                ),
                h('span', { class: 'why' }, [t('changes.copyPaths.why')]),
              ]),
              result,
            ])
          : null,
      ]),
    )
    return
  }
  const items = drafted()
  const nodes = await Promise.all(items.map((p) => node(p.id)))
  panel.replaceChildren(
    ...present([
      head,
      items.length
        ? h(
            'div',
            { class: 'sec' },
            items.map((p, i) => {
              const n = nodes[i]
              return h('div', { class: 'item' }, [
                h('span', { class: 'n' }, [String(i + 1)]),
                h('div', { class: 'what' }, [
                  h('b', {}, [n ? (state.audience === 'builder' ? friendlyName(n) : labelOf(n)) : p.id]),
                  h('span', {}, [
                    [
                      p.note.trim(),
                      p.style?.length
                        ? t(p.style.length === 1 ? 'changes.styles.one' : 'changes.styles.other', {
                            count: p.style.length,
                          })
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  ]),
                ]),
                h(
                  'button',
                  {
                    class: 'link',
                    type: 'button',
                    onclick: () => {
                      state.active = state.picks.indexOf(p)
                      open('inspector')
                    },
                  },
                  [t('changes.edit')],
                ),
                h(
                  'button',
                  {
                    class: 'link',
                    type: 'button',
                    onclick: () => {
                      preview(elementOf(p), [])
                      restoreText(elementOf(p), p.text)
                      state.picks.splice(state.picks.indexOf(p), 1)
                      state.active = Math.max(0, Math.min(state.active, state.picks.length - 1))
                      persist()
                      drawPicks()
                      renderDock()
                      void renderPanel()
                    },
                  },
                  [t('changes.remove')],
                ),
              ])
            }),
          )
        : h('div', { class: 'empty' }, [h('b', {}, [t('changes.empty.title')]), t('changes.empty.text')]),
      items.length ? h('div', { class: 'sec' }, [exportBlock()]) : null,
    ]),
  )
}

async function renderRequest(number: string) {
  panel.hidden = false
  let r: Awaited<ReturnType<typeof one>>
  try {
    r = await one(number)
  } catch {
    return open('changes', null, 'saved')
  }
  const result = h('div', { class: 'status', role: 'status' })
  let armed = false
  const del = h(
    'button',
    {
      type: 'button',
      class: 'danger',
      onclick: async () => {
        if (!armed) {
          armed = true
          del.textContent = t('request.remove.confirm')
          return
        }
        await remove(r.number)
        renderDock()
        open('changes', null, 'saved')
      },
    },
    [t('request.remove')],
  )
  panel.replaceChildren(
    h('div', { class: 'head' }, [
      h('button', { class: 'back', type: 'button', onclick: () => open('changes', null, 'saved') }, [
        t('request.back'),
      ]),
      h('h2', { class: 'title' }, [r.title]),
      h('div', { class: 'kicker' }, [r.file]),
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
              status(result, 'ok', [t('request.copiedAsk', { ask: `Do the Hozu request ${r.file}` })])
            },
          },
          [t('request.copyAsk')],
        ),
        h(
          'button',
          {
            type: 'button',
            onclick: async () => {
              await copy(r.markdown)
              status(result, 'ok', [t('request.copied')])
            },
          },
          [t('request.copy')],
        ),
        del,
      ]),
      result,
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
      h('h2', { class: 'title' }, [t('settings.title')]),
      closeButton(() => open(state.picks.length ? 'inspector' : null)),
    ]),
    h('div', { class: 'sec' }, [
      h('div', { class: 'label' }, [t('settings.appearance')]),
      h(
        'div',
        { class: 'tabs', role: 'radiogroup', 'aria-label': t('settings.appearance') },
        (
          [
            ['system', t('settings.system')],
            ['light', t('settings.light')],
            ['dark', t('settings.dark')],
          ] as const
        ).map(([value, label]) =>
          h(
            'button',
            {
              class: 'tab',
              type: 'button',
              role: 'radio',
              'aria-checked': String(state.theme === value),
              'aria-pressed': String(state.theme === value),
              onclick: () => {
                state.theme = value
                persist()
                applyTheme()
                renderSettings()
              },
            },
            [label],
          ),
        ),
      ),
    ]),
    h('div', { class: 'sec' }, [
      h('div', { class: 'label' }, [t('settings.show')]),
      h('fieldset', {}, [
        choice('builder', t('settings.builder'), t('settings.builder.detail')),
        choice('developer', t('settings.developer'), t('settings.developer.detail')),
      ]),
    ]),
    h('div', { class: 'sec' }, [
      h('div', { class: 'label' }, [t('settings.requests')]),
      h('label', { class: 'option' }, [
        h('input', {
          type: 'checkbox',
          checked: state.excerpt,
          onchange: (event) => {
            state.excerpt = (event.target as HTMLInputElement).checked
            persist()
          },
        }),
        h('span', {}, [h('b', {}, [t('settings.excerpt')]), h('span', {}, [t('settings.excerpt.detail')])]),
      ]),
    ]),
    h('div', { class: 'sec' }, [
      h('div', { class: 'label' }, [t('settings.keys')]),
      ...[
        ['Alt+Shift+S', t('keys.toggle')],
        ['Click', t('keys.click')],
        ['Shift+click', t('keys.add')],
        ['Shift+Enter', t('keys.around')],
        ['Enter', t('keys.inside')],
        ['Tab / Shift+Tab', t('keys.beside')],
        ['Alt (hold)', t('keys.measure')],
        ['Double-click', t('keys.text')],
        ['↑ ↓', t('keys.arrows')],
        ['Esc', t('keys.escape')],
      ].map(([k, v]) => h('div', { class: 'keyrow' }, [h('kbd', {}, [k!]), v!])),
    ]),
  )
}

const devices = [
  { name: 'Phone', width: 390, height: 844 },
  { name: 'Tablet', width: 820, height: 1180 },
  { name: 'Laptop', width: 1280, height: 800 },
  { name: 'Desktop', width: 1440, height: 900 },
]

const deviceNames: Record<string, MessageKey> = {
  Phone: 'bench.phone',
  Tablet: 'bench.tablet',
  Laptop: 'bench.laptop',
  Desktop: 'bench.desktop',
}

const left = h('div', { class: 'bench-left' })
const stage = h('div', { class: 'stage' })
const sizer = h('div', { class: 'sizer' })
const bar = h('div', { class: 'bench-bar' })

addEventListener(
  'keydown',
  (event) => {
    if (state.view === 'workbench' && win !== window) onKey(event)
  },
  true,
)

function retarget(frame: HTMLIFrameElement | null) {
  listening.abort()
  const w = frame?.contentWindow ?? null
  frameEl = w ? frame : null
  win = w ?? window
  doc = w?.document ?? document
  listening = listen(win)
  hovered = null
  mountOutline(doc)
  drawPicks()
}

let dragScale: number | null = null

function layout() {
  if (!frameEl) return
  const box = stage.getBoundingClientRect()
  const { width, height } = state.device
  const scale = dragScale ?? Math.min(1, (box.width - 48) / width, (box.height - 48) / height)
  sizer.style.width = `${width * scale}px`
  sizer.style.height = `${height * scale}px`
  frameEl.style.width = `${width}px`
  frameEl.style.height = `${height}px`
  frameEl.style.transform = `scale(${scale})`
  const size = bar.querySelector('[data-size]')
  if (size) size.textContent = `${width} × ${height}${scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}`
}

function setDevice(device: State['device']) {
  state.device = {
    ...device,
    width: Math.max(320, Math.round(device.width)),
    height: Math.max(400, Math.round(device.height)),
  }
  persist()
  renderBar()
  layout()
}

function renderBar() {
  const mode = (label: string, value: State['mode']) =>
    h(
      'button',
      {
        class: 'mode',
        type: 'button',
        'aria-pressed': String(state.mode === value),
        onclick: () => setMode(value),
      },
      [label],
    )
  const select = h(
    'select',
    {
      'aria-label': t('bench.device'),
      onchange: (e) => {
        const d = devices.find((x) => x.name === (e.target as HTMLSelectElement).value)
        if (d) setDevice(d)
      },
    },
    [
      ...devices.map((d) =>
        h('option', { value: d.name, selected: d.name === state.device.name }, [
          t('bench.option', { name: t(deviceNames[d.name]!), width: d.width }),
        ]),
      ),
      devices.some((d) => d.name === state.device.name)
        ? null
        : h('option', { value: 'Custom', selected: true }, [t('bench.custom')]),
    ],
  )
  bar.replaceChildren(
    ...present([
      h('div', { class: 'grip' }, [h('img', { src: logo, alt: 'Hozu', width: '18', height: '18' })]),
      h('div', { class: 'seg' }, [mode(t('dock.browse'), 'browse'), mode(t('dock.select'), 'select')]),
      h(
        'button',
        {
          class: 'act layers-toggle',
          type: 'button',
          'aria-pressed': String(bench.classList.contains('layers-open')),
          onclick: () => {
            bench.classList.toggle('layers-open')
            renderBar()
          },
        },
        [t('dock.layers')],
      ),
      select,
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          title: t('bench.rotate'),
          'aria-label': t('bench.rotate'),
          onclick: () =>
            setDevice({ name: state.device.name, width: state.device.height, height: state.device.width }),
        },
        ['⟲'],
      ),
      h('span', { class: 'size', 'data-size': true }),
      h('span', { class: 'spacer' }),
      held()
        ? h('button', { class: 'previewing', type: 'button', onclick: () => hold(null, reload) }, [
            `${t('dock.preview')} · ${t('dock.exit')}`,
          ])
        : null,
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          onclick: () =>
            open(state.panel === 'changes' ? null : 'changes', null, drafted().length ? 'draft' : 'saved'),
        },
        [
          t('dock.changes'),
          h('span', { class: 'count' }, [drafted().length ? String(drafted().length) : '']),
        ],
      ),
      h(
        'button',
        {
          class: 'act gear',
          type: 'button',
          'aria-label': t('dock.settings'),
          onclick: () => open(state.panel === 'settings' ? null : 'settings'),
        },
        ['⚙'],
      ),
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          title: t('bench.api.title'),
          'aria-pressed': api.isOpen() ? 'true' : 'false',
          onclick: () => api.toggle(),
        },
        [t('dock.api')],
      ),
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          title: t('dock.assets.title'),
          onclick: () => void assets.open(),
        },
        [t('dock.assets')],
      ),
      h('button', { class: 'act exit', type: 'button', onclick: () => closeBench() }, [t('bench.exit')]),
    ]),
  )
}

async function renderLeft() {
  await renderLayers(left, await tree(win.location.pathname), layersHost(closeLayers))
}

function closeLayers() {
  bench.classList.remove('layers-open')
  renderBar()
}

function openBench() {
  state.view = 'workbench'
  persist()
  root.classList.add('benching')
  bench.hidden = false
  const frame = h('iframe', {
    src: location.href,
    title: t('bench.frame'),
    'data-hozu-bench': true,
  }) as HTMLIFrameElement
  frame.addEventListener('load', () => {
    retarget(frame)
    void api.reload()
    renderBar()
    layout()
    void renderLeft()
    void renderPanel()
  })
  const grip = h('div', { class: 'resize', title: t('common.resize'), 'aria-hidden': 'true' })
  grip.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    grip.setPointerCapture(event.pointerId)
    const start = { x: event.clientX, y: event.clientY, ...state.device }
    dragScale = sizer.getBoundingClientRect().width / state.device.width
    sizer.classList.add('dragging')
    let next = { ...state.device }
    let queued = 0
    const move = (e: PointerEvent) => {
      next = {
        name: 'Custom',
        width: Math.max(320, Math.round(start.width + (e.clientX - start.x) / (dragScale ?? 1))),
        height: Math.max(400, Math.round(start.height + (e.clientY - start.y) / (dragScale ?? 1))),
      }
      if (queued) return
      queued = requestAnimationFrame(() => {
        queued = 0
        state.device = next
        layout()
      })
    }
    const up = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', up)
      grip.removeEventListener('pointercancel', up)
      cancelAnimationFrame(queued)
      dragScale = null
      sizer.classList.remove('dragging')
      setDevice(next)
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up)
    grip.addEventListener('pointercancel', up)
  })
  sizer.replaceChildren(frame, grip)
  stage.replaceChildren(sizer)
  bench.replaceChildren(left, h('div', { class: 'bench-center' }, [bar, stage]))
  renderBar()
  renderDock()
  requestAnimationFrame(layout)
}

function closeBench() {
  const at = frameEl?.contentWindow?.location.href
  state.view = 'overlay'
  persist()
  if (at && at !== location.href) return void location.assign(at)
  retarget(null)
  root.classList.remove('benching')
  bench.hidden = true
  bench.replaceChildren()
  renderDock()
  void renderPanel()
}

addEventListener('resize', layout)
addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape' && !typingIn(event) && bench.classList.contains('layers-open')) closeLayers()
  },
  true,
)

renderDock()
drawPicks()
void renderPanel()
api.restore()
requestAnimationFrame(frame)
if (state.view === 'workbench') openBench()
