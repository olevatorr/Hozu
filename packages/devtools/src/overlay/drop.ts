import { t } from '../messages.ts'
import type { Addition } from '../prompt.ts'
import { h } from './dom.ts'

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
  /** Selects the part the component was dropped at. */
  drop(el: Element): void
  place(add: Addition, note: string): void
  /** Windows besides this one whose page the pointer can be over (the Workbench frame's). */
  windows?(): Window[]
}

const swallowed = ['mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu'] as const

/**
 * Swallows the page's mouse and click events from the moment a drag starts until the click that ends it, so a drop
 * on a button or a link never presses it.
 */
export function gestureGuard(windows: () => Window[]) {
  let held: Window[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  const swallow = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.type === 'click') release()
    else if (event.type === 'mouseup') {
      if (timer) clearTimeout(timer)
      timer = setTimeout(release, 400)
    }
  }
  const release = () => {
    if (timer) clearTimeout(timer)
    timer = null
    for (const w of held) for (const type of swallowed) w.removeEventListener(type, swallow, true)
    held = []
  }
  return {
    hold: () => {
      if (held.length) return
      held = [...new Set(windows())]
      for (const w of held) for (const type of swallowed) w.addEventListener(type, swallow, true)
    },
    release,
    /** A gesture whose end has not reached the page yet. */
    holding: () => held.length > 0,
    /** The pointer is up: the click that follows, if any, comes soon. */
    settle: () => {
      if (!held.length) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(release, 400)
    },
  }
}

const px = (n: number) => `${n}px`

export function dragger(host: DropHost) {
  const ghost = h('div', { class: 'drag-ghost', hidden: true })
  const indicator = h('div', { class: 'drop', hidden: true }, [
    h('div', { class: 'drop-mark' }),
    h('div', { class: 'drop-tag', 'data-drop-label': true }),
  ])
  const note = h('div', { class: 'drop-note', role: 'dialog', hidden: true })
  const mark = indicator.firstElementChild as HTMLElement
  const tag = indicator.lastElementChild as HTMLElement
  let stop: (() => void) | null = null
  const guard = gestureGuard(() => [window, ...(host.windows?.() ?? [])])
  let over: { el: Element; position: Position } | null = null

  const hide = () => {
    ghost.hidden = true
    indicator.hidden = true
    tag.textContent = ''
    over = null
  }

  const show = async (hit: Target | null) => {
    if (!hit) {
      indicator.hidden = true
      over = null
      return
    }
    const r = hit.el.getBoundingClientRect()
    const position = dropPosition(r, hit.y, holds(hit.el.tagName))
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
    tag.textContent = ''
    const part = await host.name(hit.el)
    if (over?.el === hit.el && over.position === position) tag.textContent = t(`drop.${position}`, { part })
  }

  const ask = (add: Addition, title: string, x: number, y: number) => {
    const text = h('textarea', {
      rows: '3',
      placeholder: t('drop.note.placeholder'),
      'aria-label': t('assets.place.aria'),
    }) as HTMLTextAreaElement
    const close = () => {
      note.hidden = true
      note.replaceChildren()
    }
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
              host.place(add, value)
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

  /** Starts following the pointer from a press on `handle`; a press that does not move stays a click. */
  const start = (down: PointerEvent, handle: HTMLElement, carried: Carried, label: string) => {
    if (down.button !== 0 || stop) return
    if (!(down.target as Element).closest('button, select, textarea, input')) down.preventDefault()
    let moved = false
    const move = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return
      if (!moved) {
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 4) return
        moved = true
        try {
          handle.setPointerCapture(e.pointerId)
        } catch {}
        guard.hold()
        host.started()
        ghost.textContent = label
        ghost.hidden = false
      }
      ghost.style.left = px(e.clientX + 14)
      ghost.style.top = px(e.clientY + 14)
      void show(host.target(e.clientX, e.clientY))
    }
    const up = async (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return
      const at = over
      end()
      if (moved) guard.settle()
      if (!moved || !at || e.type === 'pointercancel') return
      host.drop(at.el)
      const title = t(`drop.${at.position}`, { part: await host.name(at.el) })
      ask({ ...carried, position: at.position }, title, e.clientX, e.clientY)
    }
    const end = () => {
      removeEventListener('pointermove', move, true)
      removeEventListener('pointerup', up, true)
      removeEventListener('pointercancel', up, true)
      stop = null
      hide()
    }
    addEventListener('pointermove', move, true)
    addEventListener('pointerup', up, true)
    addEventListener('pointercancel', up, true)
    stop = end
  }

  return {
    ghost,
    indicator,
    note,
    start,
    /** A drag, or the end of one, still owns the page's mouse events. */
    holding: guard.holding,
    /** Escape: cancels a drag or closes the note; true when it did. */
    escape: () => {
      if (stop) {
        stop()
        return true
      }
      if (note.hidden) return false
      note.hidden = true
      note.replaceChildren()
      return true
    },
  }
}
