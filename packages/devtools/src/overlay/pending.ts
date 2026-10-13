import { t } from '../messages.ts'
import type { Addition } from '../prompt.ts'
import { placeholderFor } from './assets.ts'

/** A component added to the request, shown where it will go until the request is done. */
export interface PendingItem {
  key: string
  id: string
  index: number
  add: Addition
  number: number
}

interface Shown {
  el: HTMLElement
  item: PendingItem
}

const shell = `<style>
:host { display: block; width: fit-content; max-width: 100%; position: relative; pointer-events: none;
  outline: 2px dashed #fb3a0e; outline-offset: 4px; border-radius: 2px; }
::slotted(*) { pointer-events: none; }
.tag { position: absolute; top: -8px; right: -8px; transform: translateY(-100%); white-space: nowrap;
  background: #fb3a0e; color: #fff; font: 600 11px/1.2 system-ui, -apple-system, sans-serif; padding: 3px 7px;
  border-radius: 999px; }
</style><slot></slot><span class="tag"></span>`

const stripped = /^(id|data-hz|data-hozu)/

const rendered = new Map<string, Promise<string | null>>()

function htmlOf(add: Addition): Promise<string | null> {
  const name = add.component.split('.').pop() ?? add.component
  const use = {
    variant: add.variant,
    ...(add.children ? { children: placeholderFor(name, add.variant) } : {}),
    ...(add.icon?.d ? { props: { [add.icon.prop]: add.icon.d } } : {}),
  }
  const query = add.example
    ? `example=${encodeURIComponent(add.example.name)}`
    : `use=${encodeURIComponent(JSON.stringify(use))}`
  const url = `/_hozu/dev/component?id=${encodeURIComponent(add.component)}&${query}`
  let found = rendered.get(url)
  if (!found) {
    found = fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ ok: boolean; html: string }>) : null))
      .then((out) => (out?.ok ? out.html : null))
      .catch(() => null)
    rendered.set(url, found)
  }
  return found
}

function build(doc: Document, html: string): HTMLElement {
  const el = doc.createElement('hozu-pending')
  el.inert = true
  el.setAttribute('aria-hidden', 'true')
  el.attachShadow({ mode: 'open' }).innerHTML = shell
  const template = doc.createElement('template')
  template.innerHTML = html
  for (const script of template.content.querySelectorAll('script')) script.remove()
  for (const part of template.content.querySelectorAll('*'))
    for (const { name } of [...part.attributes]) if (stripped.test(name)) part.removeAttribute(name)
  el.append(template.content)
  return el
}

function label(el: HTMLElement, number: number) {
  el.setAttribute('data-hozu-pending', String(number))
  const tag = el.shadowRoot?.querySelector('.tag')
  if (tag) tag.textContent = t('drop.pending', { n: number })
}

/** Whether `els` already sit at `position` of `anchor`, in order. */
function placed(anchor: Element, position: Addition['position'], els: HTMLElement[]): boolean {
  const first = els[0]
  const last = els[els.length - 1]
  if (!first || !last) return true
  if (els.some((el, i) => i > 0 && els[i - 1]?.nextElementSibling !== el)) return false
  if (position === 'before') return last.nextElementSibling === anchor
  if (position === 'after') return anchor.nextElementSibling === first
  return last.parentElement === anchor && last.nextElementSibling === null
}

/**
 * Inserts each pending component into the page at its place, once, and puts it back when the page re-renders
 * around it. Dev only: the page's own stylesheet styles it, DevTools marks it and nothing can select it.
 */
export function pendingPreviews(host: { doc: () => Document }) {
  const shown = new Map<string, Shown>()
  let wanted: PendingItem[] = []
  let observed: Document | null = null
  let queued = false
  const observer = new MutationObserver(() => {
    if (shown.size) schedule()
  })

  const anchorOf = (doc: Document, item: PendingItem) =>
    doc.querySelectorAll(`[data-hz="${CSS.escape(item.id)}"]`)[item.index] ?? null

  const place = () => {
    const doc = observed
    if (!doc) return
    const groups = new Map<Element, Map<Addition['position'], HTMLElement[]>>()
    for (const item of wanted) {
      const entry = shown.get(item.key)
      if (!entry) continue
      const anchor = anchorOf(doc, item)
      if (!anchor) {
        entry.el.remove()
        continue
      }
      const byPosition = groups.get(anchor) ?? new Map<Addition['position'], HTMLElement[]>()
      groups.set(anchor, byPosition)
      byPosition.set(item.add.position, [...(byPosition.get(item.add.position) ?? []), entry.el])
    }
    for (const [anchor, byPosition] of groups)
      for (const [position, els] of byPosition) {
        if (placed(anchor, position, els)) continue
        if (position === 'before') anchor.before(...els)
        else if (position === 'after') anchor.after(...els)
        else anchor.append(...els)
      }
  }

  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      place()
    })
  }

  const clear = () => {
    for (const { el } of shown.values()) el.remove()
    shown.clear()
  }

  return {
    sync(items: PendingItem[]) {
      const doc = host.doc()
      if (observed !== doc) {
        observer.disconnect()
        clear()
        observed = doc
        observer.observe(doc.documentElement, { childList: true, subtree: true })
      }
      wanted = items
      const keys = new Set(items.map((i) => i.key))
      for (const [key, { el }] of shown)
        if (!keys.has(key)) {
          el.remove()
          shown.delete(key)
        }
      for (const item of items) {
        const kept = shown.get(item.key)
        if (kept) {
          kept.item = item
          label(kept.el, item.number)
          continue
        }
        void htmlOf(item.add).then((html) => {
          const now = wanted.find((w) => w.key === item.key)
          if (html === null || observed !== doc || !now || shown.has(item.key)) return
          const el = build(doc, html)
          label(el, now.number)
          shown.set(item.key, { el, item: now })
          place()
        })
      }
      schedule()
    },
  }
}

/** A key that stays the same across reloads for the same added component at the same place. */
export function pendingKeys(items: { id: string; index: number; add: Addition }[]): string[] {
  const seen = new Map<string, number>()
  return items.map(({ id, index, add }) => {
    const base = `${id}|${index}|${add.position}|${add.component}|${JSON.stringify(add.variant)}|${add.example?.name ?? ''}|${add.icon?.name ?? ''}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return `${base}|${n}`
  })
}
