import type { Json } from '@tenonkit/core/ir'

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
      case 'form': {
        const out: Record<string, string> = {}
        const form = e.target as HTMLFormElement
        const win = form.ownerDocument.defaultView as (Window & typeof globalThis) | null
        for (const [k, v] of new (win?.FormData ?? FormData)(form))
          out[k] = typeof v === 'string' ? v : v.name
        return out
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
