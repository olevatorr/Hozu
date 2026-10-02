import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { transform } from './transform.ts'

type Load = (
  url: string,
  context: { format?: string | null },
  next: (url: string, context: unknown) => Promise<{ format?: string | null; source?: unknown }>,
) => Promise<{ format?: string | null; source?: unknown; shortCircuit?: boolean }>

const MAX_ENTRIES = 20_000

let cache: string | null = null
let salt = ''

/**
 * `register('@hozu/transform/hook', parent, { data: { cache } })` keeps transformed sources in that directory,
 * keyed by the source and the transform's own code (ADR 0050 D). The cache is safe to delete.
 */
export function initialize(data?: { cache?: string }) {
  if (!data?.cache) return
  try {
    const own = new URL(`./transform${import.meta.url.endsWith('.ts') ? '.ts' : '.js'}`, import.meta.url)
    salt = createHash('sha256').update(readFileSync(own)).digest('hex')
    mkdirSync(data.cache, { recursive: true })
    if (readdirSync(data.cache).length > MAX_ENTRIES) {
      rmSync(data.cache, { recursive: true, force: true })
      mkdirSync(data.cache, { recursive: true })
    }
    cache = data.cache
  } catch {
    cache = null
  }
}

function cached(source: string): string {
  if (!cache) return transform(source).code
  const file = join(cache, `${createHash('sha256').update(salt).update(source).digest('hex')}.js`)
  try {
    return readFileSync(file, 'utf8')
  } catch {}
  const code = transform(source).code
  try {
    const temp = `${file}.${process.pid}.tmp`
    writeFileSync(temp, code)
    renameSync(temp, file)
  } catch {}
  return code
}

export const load: Load = async (url, context, next) => {
  const result = await next(url, context)
  if (!url.startsWith('file:') || url.includes('/node_modules/') || !/\.(m|c)?ts$/.test(url)) return result
  if (!/typescript/.test(result.format ?? '')) return result
  const source =
    typeof result.source === 'string'
      ? result.source
      : Buffer.from(result.source as Uint8Array).toString('utf8')
  if (!source.includes('@hozu/core')) return result
  const code = cached(source)
  return code === source ? result : { ...result, source: code }
}
