import { transform } from './transform.ts'

type Load = (
  url: string,
  context: { format?: string | null },
  next: (url: string, context: unknown) => Promise<{ format?: string | null; source?: unknown }>,
) => Promise<{ format?: string | null; source?: unknown; shortCircuit?: boolean }>

export const load: Load = async (url, context, next) => {
  const result = await next(url, context)
  if (!url.startsWith('file:') || url.includes('/node_modules/') || !/\.(m|c)?ts$/.test(url)) return result
  if (!/typescript/.test(result.format ?? '')) return result
  const source =
    typeof result.source === 'string'
      ? result.source
      : Buffer.from(result.source as Uint8Array).toString('utf8')
  const out = transform(source, url)
  return out.changed ? { ...result, source: out.code } : result
}
