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
}

export function memoryCache(): PageCache {
  const pages = new Map<string, CachedPage>()
  return {
    get: async (key) => pages.get(key),
    set: async (key, page) => {
      pages.set(key, page)
    },
    deleteTags: async (tags) => {
      let count = 0
      for (const [key, page] of pages)
        if (tags.some((t) => page.tags.includes(t))) {
          pages.delete(key)
          count++
        }
      return count
    },
  }
}
