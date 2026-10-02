import { Lru } from '@hozu/data'

export interface CachedPage {
  html: string
  status: number
  redirect: string | null
  at: number
  ttl: number
  tags: string[]
}

export interface PageCache {
  get(key: string): Promise<CachedPage | undefined>
  set(key: string, page: CachedPage): Promise<void>
  deleteTags(tags: string[]): Promise<number>
  /** Pages now cached and pages dropped to stay within a bound, for `server.stats()`; optional. */
  readonly size?: number
  readonly evictions?: number
}

/** The default page cache: at most `maxPages` pages, least recently used first out (ADR 0050 D1). */
export function memoryCache({ maxPages = 5_000 }: { maxPages?: number } = {}): PageCache {
  const pages = new Lru<CachedPage>(maxPages)
  return {
    get: async (key) => pages.get(key),
    set: async (key, page) => pages.set(key, page, page.tags),
    deleteTags: async (tags) => pages.deleteTags(tags),
    get size() {
      return pages.size
    },
    get evictions() {
      return pages.evictions
    },
  }
}
