/**
 * The shortcut of `keys` this press matches, or undefined (ADR 0072 B, ADR 0073 B). A printable key without Mod, Ctrl,
 * Meta or Alt does not fire while the person types in a field, nor while an input method composes. Alt combinations
 * match the physical letter (macOS turns Alt+k into "˚").
 */
export const shortcut = (e: KeyboardEvent, keys: string[]): string | undefined =>
  e.isComposing
    ? undefined
    : keys.find((k) => {
        const p = k.split(/\+(?!$)/)
        const key = p.pop()!
        const has = (m: string) =>
          p.includes(m) || (p.includes('Mod') && m === (/Mac|iP/.test(navigator.platform) ? 'Meta' : 'Ctrl'))
        const t = e.target as HTMLElement | null
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
            (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? ''))
          )
        )
      })

const FIELD = /^(TEXTAREA|SELECT)$|^INPUT$/
const PRESSED = /^(button|submit|reset|checkbox|radio|image|file|color)$/

/** The element a press presses: visible, enabled, inside the open modal dialog when there is one, first in order. */
export function pressed(doc: Document, e: KeyboardEvent): HTMLElement | null {
  const modal = [...doc.querySelectorAll('dialog:modal')].pop()
  for (const el of (modal ?? doc).querySelectorAll<HTMLElement>('[data-hozu-keys]')) {
    if (el.matches(':disabled') || el.closest('[hidden], [inert]') || !el.getClientRects().length) continue
    if (shortcut(e, el.dataset.hozuKeys!.split(' '))) return el
  }
  return null
}

/** Presses the matching control: a field is focused (its text selected), anything else clicked. */
export function listen(doc: Document): void {
  doc.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return
    const el = pressed(doc, e)
    if (!el) return
    e.preventDefault()
    if (e.repeat) return
    const field =
      FIELD.test(el.tagName) && !(el.tagName === 'INPUT' && PRESSED.test((el as HTMLInputElement).type))
    if (!field) return el.click()
    el.focus()
    ;(el as HTMLInputElement).select?.()
  })
}
