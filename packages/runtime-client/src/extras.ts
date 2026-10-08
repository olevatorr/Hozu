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
