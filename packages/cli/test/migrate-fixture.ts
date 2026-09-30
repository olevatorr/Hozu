import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Writes a scratch app and returns its directory. */
export function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'hozu-migrate-'))
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), source)
  }
  return dir
}

export const read = (dir: string, name: string) => readFileSync(join(dir, name), 'utf8')

export const model = `import { endpoint, event, machine, mutation, query, route, ui } from '@hozu/core'
import { z } from 'zod'

export const home = route({ path: '/', params: null, search: z.object({ show: z.enum(['all', 'done']).default('all'), q: z.string().default('') }) })
export const login = route({ path: '/login', params: null, search: null })
export const me = query({ input: z.object({}), output: z.object({ name: z.string() }), errors: { Unauthorized: z.object({}), Forbidden: z.object({}), Gone: z.object({}) }, scope: 'user', freshness: 'static' })
export const listItems = query({ input: z.object({}), output: z.array(z.string()), scope: 'user', freshness: { swr: 30 } })
export const liveItems = query({ input: z.object({}), output: z.array(z.string()), scope: 'user', freshness: 'live', tags: [] })
export const publicItems = query({ input: z.object({}), output: z.array(z.string()), scope: 'public', freshness: { revalidate: 60 } })
export const addItem = mutation({ input: z.object({ title: z.string() }), output: z.object({}) })
export const BULK = 'bulk'
`
