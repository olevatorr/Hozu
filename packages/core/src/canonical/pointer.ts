const escapeToken = (token: string): string =>
  token.includes('~') || token.includes('/') ? token.replaceAll('~', '~0').replaceAll('/', '~1') : token

const unescapeToken = (token: string): string =>
  token.includes('~') ? token.replaceAll('~1', '/').replaceAll('~0', '~') : token

export function join(base: string, ...tokens: (string | number)[]): string {
  let out = base
  for (const t of tokens) out += `/${typeof t === 'number' ? t : escapeToken(t)}`
  return out
}

export const pointer = (...tokens: (string | number)[]): string => join('', ...tokens)

export const parsePointer = (p: string): string[] =>
  p === '' ? [] : p.slice(1).split('/').map(unescapeToken)

export function resolveSource<T>(sources: Record<string, T>, p: string): T | null {
  let current = p
  for (;;) {
    const hit = sources[current]
    if (hit) return hit
    if (current === '') return null
    current = current.slice(0, current.lastIndexOf('/'))
  }
}

export type At = string | (() => string)

export const at =
  (base: At, ...tokens: (string | number)[]): At =>
  () =>
    join(typeof base === 'string' ? base : base(), ...tokens)

export const resolveAt = (p: At): string => (typeof p === 'string' ? p : p())
