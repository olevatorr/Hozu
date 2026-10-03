import type { ProjectIR } from '@hozu/core/ir'
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

/** The origins features declare in `connect` (ADR 0051), with `{ env }` entries read from the public env. */
export function connectOrigins(ir: ProjectIR, publicEnv: Record<string, unknown>): string[] {
  const out = new Set<string>()
  for (const f of Object.values(ir.features))
    for (const c of f.connect) {
      if ('origin' in c) {
        out.add(c.origin)
        continue
      }
      const value = publicEnv[c.env]
      if (value === undefined || value === null || value === '') continue
      try {
        out.add(new URL(String(value)).origin)
      } catch {
        throw new Error(
          `connect of ${f.id} reads the public env variable ${c.env}, which is not a URL: ${String(value)}`,
        )
      }
    }
  return [...out].sort()
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
