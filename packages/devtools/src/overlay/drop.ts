import { t } from '../messages.ts'
import type { Addition } from '../prompt.ts'
import { h } from './dom.ts'
import { dropPreview } from './pending.ts'

export type Position = Addition['position']
export type Carried = Omit<Addition, 'position'>

const leaves = new Set([
  'area',
  'audio',
  'br',
  'button',
  'canvas',
  'col',
  'embed',
  'hr',
  'iframe',
  'img',
  'input',
  'option',
  'select',
  'source',
  'svg',
  'textarea',
  'track',
  'video',
  'wbr',
])

/** Whether a component can go inside an element of this tag, or only before or after it. */
export const holds = (tag: string) => !leaves.has(tag.toLowerCase())

/** Top quarter before, bottom quarter after, the middle inside; halves when the target holds nothing. */
export function dropPosition(rect: { top: number; height: number }, y: number, inside: boolean): Position {
  const at = rect.height > 0 ? (y - rect.top) / rect.height : 0.5
  if (!inside) return at < 0.5 ? 'before' : 'after'
  return at < 0.25 ? 'before' : at > 0.75 ? 'after' : 'inside'
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * The part the pointer is next to when it is over its container's own space: inside the part's width and at most
 * `reach` px above or below it, so a thin or empty part (an empty list) can still be a target.
 */
export function beside<T>(
  parts: readonly { part: T; box: Box }[],
  x: number,
  y: number,
  reach = 12,
): T | null {
  let best: T | null = null
  let gap = reach
  for (const { part, box } of parts) {
    if (box.right <= box.left || x < box.left || x > box.right) continue
    const d = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
    if (d < gap || (best === null && d === gap)) {
      best = part
      gap = d
    }
  }
  return best
}

export interface Target {
  el: Element
  /** The pointer in the page's own coordinates (the Workbench frame's, when it shows the page). */
  x: number
  y: number
}

export interface DropHost {
  /** The marked part of the page under the pointer, or null over DevTools or nothing marked. */
  target(x: number, y: number): Target | null
  name(el: Element): Promise<string>
  /** The drag starts: Assets docks so the page shows. */
  started(): void
  /** Adds the component at the part it was dropped on, without selecting that part. */
  place(add: Addition, note: string, at: Element): void
  /** Windows besides this one whose page the pointer can be over (the Workbench frame's). */
  windows?(): Window[]
  /** The event is for DevTools' own UI, not the page. */
  ui?(event: Event): boolean
}

const swallowed = ['mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu'] as const

export interface GuardOptions {
  /** DevTools' own UI: its events pass, except those of the drag handle (the click that ends the drag goes there). */
  ui?(event: Event): boolean
  /** Events that always pass (the drop note's). */
  free?(event: Event): boolean
}

/**
 * Swallows the page's mouse and click events from the moment a drag starts until the click that ends it reaches the
 * page, the next press, or a short while after the pointer is up. The browser sends that click to the drag handle
 * (pointer capture) or to the element under the pointer, so a drop on a button or a link never presses it.
 */
export function gestureGuard(windows: () => Window[], options: GuardOptions = {}) {
  let held: Window[] = []
  let handle: Element | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let ended = false
  const swallow = (event: Event) => {
    if (options.free?.(event)) return
    const ui = options.ui?.(event) ?? false
    if (ui && !(handle && event.composedPath().includes(handle))) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.type === 'click' && !ui) release()
  }
  const press = () => {
    if (ended) release()
  }
  const release = () => {
    if (timer) clearTimeout(timer)
    timer = null
    ended = false
    handle = null
    for (const w of held) {
      w.removeEventListener('pointerdown', press, true)
      for (const type of swallowed) w.removeEventListener(type, swallow, true)
    }
    held = []
  }
  return {
    /** The drag from `from` starts. */
    hold: (from: Element | null = null) => {
      if (held.length && !ended) return
      if (held.length) release()
      handle = from
      held = [...new Set(windows())]
      for (const w of held) {
        w.addEventListener('pointerdown', press, true)
        for (const type of swallowed) w.addEventListener(type, swallow, true)
      }
    },
    release,
    /** A gesture whose end has not reached the page yet. */
    holding: () => held.length > 0,
    /** The pointer is up: the click that follows, wherever it lands, comes soon. */
    settle: () => {
      if (!held.length) return
      ended = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(release, 400)
    },
  }
}

const px = (n: number) => `${n}px`

/** Moving a component already added: the drop changes where it goes, without asking for a note. */
export interface Move {
  begin(): void
  end(to: { el: Element; position: Position } | null): void
  /** Released without moving: a click, which edits the item instead of moving it. */
  click(): void
}

/** The pointer in this window's coordinates, from an event in `view` (the Workbench frame's, when it is that). */
function pointIn(view: Window, e: PointerEvent) {
  const frame = view === window ? null : (view.frameElement as HTMLElement | null)
  if (!frame) return { x: e.clientX, y: e.clientY }
  const r = frame.getBoundingClientRect()
  const scale = r.width / (frame.offsetWidth || r.width || 1)
  return { x: r.left + e.clientX * scale, y: r.top + e.clientY * scale }
}

export function dragger(host: DropHost) {
  const ghost = h('div', { class: 'drag-ghost', hidden: true })
  const indicator = h('div', { class: 'drop', hidden: true }, [
    h('div', { class: 'drop-mark' }),
    h('div', { class: 'drop-tag', 'data-drop-label': true }),
  ])
  const note = h('div', { class: 'drop-note', role: 'dialog', hidden: true })
  const mark = indicator.firstElementChild as HTMLElement
  const tag = indicator.lastElementChild as HTMLElement
  const live = dropPreview()
  const views = () => [...new Set([window, ...(host.windows?.() ?? [])])]
  let stop: (() => void) | null = null
  let closeNote: (() => void) | null = null
  let carrying: Carried | null = null
  const guard = gestureGuard(views, {
    ui: (event) => host.ui?.(event) ?? false,
    free: (event) => event.composedPath().includes(note),
  })
  let over: { el: Element; position: Position } | null = null

  const hide = () => {
    ghost.hidden = true
    indicator.hidden = true
    tag.textContent = ''
    over = null
  }

  /** The place under the pointer, read as the page is without the live preview. */
  const look = (x: number, y: number) =>
    live.without(() => {
      const hit = host.target(x, y)
      if (!hit) return null
      const r = hit.el.getBoundingClientRect()
      return { hit, r, position: dropPosition(r, hit.y, holds(hit.el.tagName)) }
    })

  const show = async (found: ReturnType<typeof look>) => {
    if (!found) {
      indicator.hidden = true
      over = null
      live.clear()
      return
    }
    const { hit, position } = found
    const r = position === 'inside' ? hit.el.getBoundingClientRect() : found.r
    const same = over?.el === hit.el && over.position === position
    over = { el: hit.el, position }
    mark.className = position === 'inside' ? 'drop-mark inside' : 'drop-mark line'
    const view = indicator.ownerDocument.defaultView ?? window
    Object.assign(mark.style, {
      left: px(r.left),
      top: px(position === 'inside' ? r.top : (position === 'before' ? r.top : r.bottom) - 2),
      width: px(r.width),
      height: position === 'inside' ? px(r.height) : '',
    })
    Object.assign(tag.style, {
      left: px(Math.max(4, Math.min(hit.x + 16, view.innerWidth - 160))),
      top: px(hit.y + 70 > view.innerHeight ? hit.y - 64 : hit.y + 44),
    })
    indicator.hidden = false
    if (same) return
    if (carrying) live.show({ ...carrying, position }, hit.el)
    tag.textContent = ''
    const part = await host.name(hit.el)
    if (over?.el === hit.el && over.position === position) tag.textContent = t(`drop.${position}`, { part })
  }

  const ask = (add: Addition, title: string, x: number, y: number, at: Element) => {
    const text = h('textarea', {
      rows: '3',
      placeholder: t('drop.note.placeholder'),
      'aria-label': t('assets.place.aria'),
    }) as HTMLTextAreaElement
    const watched = views()
    const outside = (event: Event) => {
      if (!event.composedPath().includes(note)) close()
    }
    const close = () => {
      for (const w of watched) w.removeEventListener('pointerdown', outside, true)
      closeNote = null
      note.hidden = true
      note.replaceChildren()
      live.clear()
    }
    closeNote?.()
    closeNote = close
    for (const w of watched) w.addEventListener('pointerdown', outside, true)
    note.replaceChildren(
      h('b', {}, [title]),
      text,
      h('div', { class: 'drop-actions' }, [
        h('button', { class: 'act', type: 'button', 'data-drop-cancel': true, onclick: close }, [
          t('drop.cancel'),
        ]),
        h(
          'button',
          {
            class: 'primary',
            type: 'button',
            'data-drop-add': true,
            onclick: () => {
              const value = text.value.trim()
              close()
              host.place(add, value, at)
            },
          },
          [t('drop.add')],
        ),
      ]),
    )
    note.setAttribute('aria-label', title)
    note.hidden = false
    const r = note.getBoundingClientRect()
    note.style.left = px(Math.max(8, Math.min(x + 12, innerWidth - r.width - 8)))
    note.style.top = px(Math.max(8, Math.min(y + 12, innerHeight - r.height - 8)))
    text.focus()
  }

  /**
   * Starts following the pointer from a press on `handle`; a press that does not move stays a click. With `moving`,
   * the drop moves a component already added instead of asking for a note.
   */
  const start = (down: PointerEvent, handle: HTMLElement, carried: Carried, label: string, moving?: Move) => {
    if (down.button !== 0 || stop) return
    if (moving || !(down.target as Element).closest('button, select, textarea, input')) down.preventDefault()
    closeNote?.()
    const view = handle.ownerDocument.defaultView ?? window
    const from = pointIn(view, down)
    let moved = false
    let cancelled = false
    const move = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return
      const p = pointIn(view, e)
      if (!moved) {
        if (Math.hypot(p.x - from.x, p.y - from.y) < 4) return
        moved = true
        try {
          handle.setPointerCapture(e.pointerId)
        } catch {}
        guard.hold(handle)
        host.started()
        carrying = carried
        moving?.begin()
        ghost.textContent = label
        ghost.hidden = false
      }
      ghost.style.left = px(p.x + 14)
      ghost.style.top = px(p.y + 14)
      void show(look(p.x, p.y))
    }
    const up = async (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return
      const at = e.type === 'pointercancel' || cancelled ? null : over
      const asking = moved && !!at && !moving
      end(asking)
      if (!moved) {
        if (!moving || cancelled || e.type === 'pointercancel') return
        guard.hold(handle)
        guard.settle()
        return moving.click()
      }
      guard.settle()
      if (cancelled) return
      if (moving) return moving.end(at)
      if (!at) return
      const p = pointIn(view, e)
      const title = t(`drop.${at.position}`, { part: await host.name(at.el) })
      ask({ ...carried, position: at.position }, title, p.x, p.y, at.el)
    }
    const end = (keep = false) => {
      view.removeEventListener('pointermove', move, true)
      view.removeEventListener('pointerup', up, true)
      view.removeEventListener('pointercancel', up, true)
      stop = null
      carrying = null
      hide()
      if (!keep) live.clear()
    }
    view.addEventListener('pointermove', move, true)
    view.addEventListener('pointerup', up, true)
    view.addEventListener('pointercancel', up, true)
    stop = () => {
      cancelled = true
      view.removeEventListener('pointermove', move, true)
      stop = null
      carrying = null
      hide()
      live.clear()
      if (moved) moving?.end(null)
    }
  }

  return {
    ghost,
    indicator,
    note,
    start,
    /** A drag, or the end of one, still owns the page's mouse events. */
    holding: guard.holding,
    /** A press outside the note closes it, as Cancel does (for pages whose presses DevTools swallows first). */
    dismiss: (event: Event) => {
      if (closeNote && !event.composedPath().includes(note)) closeNote()
    },
    /** Escape: cancels a drag or closes the note; true when it did. */
    escape: () => {
      if (stop) {
        stop()
        return true
      }
      if (!closeNote) return false
      closeNote()
      return true
    },
  }
}
