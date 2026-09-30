export type CspSources = Partial<
  Record<'script' | 'style' | 'img' | 'connect' | 'font' | 'frame' | 'media', string[]>
>

export const crossSite = (request: Request): boolean => {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).host !== new URL(request.url).host
  } catch {
    return true
  }
}

export function contentSecurityPolicy(extra: CspSources, scriptHashes: string[]): string {
  const list = (base: string[], more: string[] = []) => [...base, ...more].join(' ')
  return [
    "default-src 'self'",
    `script-src ${list(["'self'", ...scriptHashes.map((h) => `'${h}'`)], extra.script)}`,
    `style-src ${list(["'self'", "'unsafe-inline'"], extra.style)}`,
    `img-src ${list(["'self'", 'data:', 'blob:'], extra.img)}`,
    `connect-src ${list(["'self'"], extra.connect)}`,
    `font-src ${list(["'self'", 'data:'], extra.font)}`,
    `media-src ${list(["'self'", 'blob:'], extra.media)}`,
    `frame-src ${list(["'self'"], extra.frame)}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

const fallback = (title: string, text: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><style>@view-transition { navigation: auto; }</style><title>${title}</title></head><body><h1>${title}</h1><p>${text}</p></body></html>`

export const ERROR_HTML = fallback('Something went wrong', 'Please try again later.')

export const NOT_FOUND_HTML = fallback('Not found', 'There is no page at this address.')
