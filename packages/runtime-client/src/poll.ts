import type { Json } from '@hozu/core/ir'

interface Shared<T> {
  data: Map<string, T>
  versions: Map<string, number>
}

const mounted = <T>(data: Map<string, T>, sync: () => void) => {
  const seen = new Set<string>()
  const get = data.get
  data.get = (key) => {
    seen.add(key)
    return get.call(data, key)
  }
  try {
    sync()
  } finally {
    Reflect.deleteProperty(data, 'get')
  }
  return seen
}

const parse = (text: string): [Json] | null => {
  try {
    return [JSON.parse(text)]
  } catch {
    return null
  }
}

const split = (key: string, refs: string[]): [string, Json] | null => {
  for (const ref of refs) {
    const input = key.startsWith(ref) ? parse(key.slice(ref.length)) : null
    if (input) return [ref, input[0]]
  }
  return null
}

/** Reads the polled queries on the page again on their timers while it is visible and no effect runs (ADR 0063 C1). */
export const poll = <T>(
  doc: Document,
  every: Record<string, number>,
  shared: Shared<T>,
  read: (ref: string, input: Json) => Promise<T>,
  busy: () => number,
  sync: () => void,
) => {
  const groups = new Map<number, string[]>()
  for (const [ref, seconds] of Object.entries(every))
    groups.set(seconds, [...(groups.get(seconds) ?? []), ref])
  for (const [seconds, refs] of groups) {
    let reading = false
    setInterval(async () => {
      if (reading || doc.visibilityState === 'hidden' || busy()) return
      reading = true
      let changed = false
      for (const key of mounted(shared.data, sync)) {
        const hit = split(key, refs)
        if (!hit) continue
        const version = shared.versions.get(key)
        const result = await read(...hit).catch(() => null)
        if (result === null || busy() || shared.versions.get(key) !== version) continue
        shared.data.set(key, result)
        changed = true
      }
      reading = false
      if (changed) sync()
    }, seconds * 1000)
  }
}
