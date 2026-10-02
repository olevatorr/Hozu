type Attrs = Record<string, string | boolean | ((event: Event) => void) | undefined>
type Child = Node | string | null | undefined | false

export function h(tag: string, attrs: Attrs = {}, children: Child[] = []): HTMLElement {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    if (typeof value === 'function') el.addEventListener(key.slice(2), value)
    else if (value === true) el.setAttribute(key, '')
    else el.setAttribute(key, value)
  }
  for (const child of children)
    if (child !== null && child !== undefined && child !== false)
      el.append(typeof child === 'string' ? document.createTextNode(child) : child)
  return el
}

export const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}
