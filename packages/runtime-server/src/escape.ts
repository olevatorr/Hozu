const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

export const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (c) => map[c]!)

export const scriptJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')
