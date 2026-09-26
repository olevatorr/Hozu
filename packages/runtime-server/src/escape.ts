const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const special = /[&<>"]/
const specials = /[&<>"]/g

export const escapeHtml = (value: string): string =>
  special.test(value) ? value.replace(specials, (c) => map[c]!) : value

export const scriptSafe = (json: string): string =>
  json.includes('<') ? json.replace(/</g, '\\u003c') : json

export const scriptJson = (value: unknown): string => scriptSafe(JSON.stringify(value))
