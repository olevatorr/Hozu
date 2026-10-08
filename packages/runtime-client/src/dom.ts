import { formEntries } from '@hozu/core/forms'
import type { Json } from '@hozu/core/ir'

export const SVG_NS = 'http://www.w3.org/2000/svg'

const stringBooleans = new Set(['contenteditable', 'draggable', 'spellcheck'])

export const text = (v: Json | undefined) =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export function attrText(name: string, x: Json | undefined): string | null {
  if (x === null || x === undefined) return null
  if (typeof x === 'boolean') {
    if (name.startsWith('aria-') || name.startsWith('data-') || stringBooleans.has(name)) return String(x)
    return x ? '' : null
  }
  return text(x)
}

/**
 * `aria-current` of an internal link (ADR 0069 B4, ADR 0070 A3): `page` for the address being shown, `true` for a
 * section above it (`/orders` while on `/orders/7`), nothing for the same path with another search (a next page).
 */
export function currentOf(href: Json, here: string, root = '/'): string | null {
  if (typeof href !== 'string' || !href.startsWith('/')) return null
  if (href === here) return 'page'
  const path = href.split('?')[0]!
  const at = here.split('?')[0]!
  return path !== '/' && path !== root && at.startsWith(path.endsWith('/') ? path : `${path}/`) ? 'true' : null
}

export const properties = new Set(['value', 'checked', 'selected', 'muted'])

export const passive = new Set([
  'scroll',
  'wheel',
  'touchstart',
  'touchmove',
  'touchend',
  'pointermove',
  'mousemove',
])

const num = (x: unknown): Json => (typeof x === 'number' && !Number.isNaN(x) ? x : null)

export const uploads = new Map<string, File>()

const fileList = (files: FileList | null | undefined): Json =>
  files
    ? [...files].map((f) => {
        const token = `u${uploads.size + 1}`
        uploads.set(token, f)
        return { name: f.name, size: f.size, type: f.type, token }
      })
    : []

export const domField =
  (e: Event) =>
  (field: string): Json => {
    const t = e.target as Record<string, unknown> | null
    switch (field) {
      case 'value':
        return typeof t?.value === 'string' ? t.value : ''
      case 'checked':
        return t?.checked === true
      case 'valueAsNumber':
        return num(t?.valueAsNumber)
      case 'files':
        return fileList((t?.files as FileList | undefined) ?? (e as DragEvent).dataTransfer?.files)
      case 'form':
      case 'formAll': {
        const form = e.target as HTMLFormElement
        const win = form.ownerDocument.defaultView as (Window & typeof globalThis) | null
        const d = formEntries(new (win?.FormData ?? FormData)(form, (e as SubmitEvent).submitter))
        return field === 'form' ? d.first : d.all
      }
      case 'open':
        return t?.open === true
      case 'returnValue':
        return typeof t?.returnValue === 'string' ? t.returnValue : ''
      default: {
        const x = field in e ? (e as unknown as Record<string, unknown>)[field] : t?.[field]
        return typeof x === 'number' ? num(x) : typeof x === 'string' || typeof x === 'boolean' ? x : null
      }
    }
  }

export const classText = (base: string | null, active: string[]) =>
  base ? (active.length ? `${base} ${active.join(' ')}` : base) : active.join(' ')

export const styleText = (vars: [string, Json][]) => {
  let out = ''
  for (const [name, x] of vars)
    if (x !== null && x !== undefined && x !== '') out += `${out ? ';' : ''}${name}:${text(x)}`
  return out
}
