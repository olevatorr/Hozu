/**
 * The store for public, cacheable query results (ADR 0050 A). It is synchronous: the render path reads it inline.
 * Entries are opaque to the store; `deleteTags` drops every entry that carries one of the tags, and an evicted or
 * dropped entry is recomputed by its next read.
 */
export interface DataCache {
  get(key: string): CacheEntry | undefined
  set(key: string, entry: CacheEntry, tags: string[]): void
  deleteTags(tags: string[]): number
  readonly size: number
  readonly evictions: number
}

/** A cached query result; the data runtime owns its fields. */
export type CacheEntry = object

/** Least recently used entries in insertion order, with a tag → keys index. */
export class Lru<V> {
  readonly #max: number
  readonly #items = new Map<string, { value: V; tags: string[] }>()
  readonly #byTag = new Map<string, Set<string>>()
  evictions = 0

  constructor(max: number) {
    if (!Number.isInteger(max) || max < 1)
      throw new RangeError(`The cache bound must be a positive integer, got ${max}`)
    this.#max = max
  }

  get size() {
    return this.#items.size
  }

  get(key: string): V | undefined {
    const item = this.#items.get(key)
    if (!item) return undefined
    this.#items.delete(key)
    this.#items.set(key, item)
    return item.value
  }

  set(key: string, value: V, tags: string[] = []) {
    this.delete(key)
    this.#items.set(key, { value, tags })
    for (const tag of tags) {
      const keys = this.#byTag.get(tag) ?? new Set<string>()
      this.#byTag.set(tag, keys)
      keys.add(key)
    }
    while (this.#items.size > this.#max) {
      this.delete(this.#items.keys().next().value!)
      this.evictions++
    }
  }

  delete(key: string): boolean {
    const item = this.#items.get(key)
    if (!item) return false
    this.#items.delete(key)
    for (const tag of item.tags) {
      const keys = this.#byTag.get(tag)
      keys?.delete(key)
      if (keys?.size === 0) this.#byTag.delete(tag)
    }
    return true
  }

  deleteTags(tags: string[]): number {
    let count = 0
    for (const tag of new Set(tags))
      for (const key of [...(this.#byTag.get(tag) ?? [])]) if (this.delete(key)) count++
    return count
  }
}

/** The default data cache: at most `maxEntries` entries, least recently used first out (ADR 0050 D1). */
export function memoryDataCache({ maxEntries = 10_000 }: { maxEntries?: number } = {}): DataCache {
  const lru = new Lru<CacheEntry>(maxEntries)
  return {
    get: (key) => lru.get(key),
    set: (key, entry, tags) => lru.set(key, entry, tags),
    deleteTags: (tags) => lru.deleteTags(tags),
    get size() {
      return lru.size
    },
    get evictions() {
      return lru.evictions
    },
  }
}
