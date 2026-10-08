import type { Json } from '@hozu/core/ir'

/**
 * `aria-current` of an internal link (ADR 0071 A1): `page` for the address shown; the author's value otherwise, where
 * `true` (a section, from `current(route)`) becomes `page` on the address itself and `false` writes nothing.
 */
export const currentOf = (href: Json, here: string, own?: Json): string | null =>
  own === undefined || own === true
    ? href === here
      ? 'page'
      : own
        ? 'true'
        : null
    : own === false || own === null
      ? null
      : String(own)

/** Dialogs closed by the machine, whose close event is not the person's (ADR 0069 B3). */
export const quiet = new WeakSet<Node>()

export function dialog(d: HTMLDialogElement, x: Json): void {
  if (x === true) {
    d.removeAttribute('open')
    queueMicrotask(() => d.isConnected && !d.open && d.showModal())
  } else if (d.open) quiet.add(d) && d.close()
}

export function current(el: Element, x: Record<string, Json>, here: string): void {
  const at = currentOf(x.h!, here, x.o)
  if (at) el.setAttribute('aria-current', at)
  else el.removeAttribute('aria-current')
}

/**
 * The shortcut of `keys` this press matches, or undefined (ADR 0072 B). A printable key without Mod, Ctrl, Meta or Alt
 * does not fire while the person types in a field inside the listening element (or anywhere, for the window), nor
 * while an input method composes. Alt combinations match the physical letter (macOS turns Alt+k into "˚").
 */
export const shortcut = (e: KeyboardEvent, keys: string[]): string | undefined =>
  e.isComposing
    ? undefined
    : keys.find((k) => {
        const p = k.split(/\+(?!$)/)
        const key = p.pop()!
        const has = (m: string) =>
          p.includes(m) || (p.includes('Mod') && m === (/Mac|iP/.test(navigator.platform) ? 'Meta' : 'Ctrl'))
        const t = e.target as HTMLElement
        const letter = /^[a-z]$/i.test(key)
        return (
          e.ctrlKey === has('Ctrl') &&
          e.metaKey === has('Meta') &&
          e.altKey === has('Alt') &&
          (key.length > 1 || letter ? e.shiftKey === has('Shift') : e.shiftKey || !has('Shift')) &&
          ((key === 'Space' ? ' ' : key).toLowerCase() === e.key?.toLowerCase() ||
            (letter && e.altKey && e.code === `Key${key.toUpperCase()}`)) &&
          !(
            (key.length === 1 || key === 'Space') &&
            p.every((m) => m === 'Shift') &&
            t !== e.currentTarget &&
            (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
          )
        )
      })
