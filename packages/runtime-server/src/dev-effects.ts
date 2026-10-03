import type { DevEffect, DevOptions } from '@hozu/core/ir'

const literal = (s: string) => s.replace(/[$]/g, '\\$&')

/** Fills in where each effect is implemented: its `implement(...)` in the app module, or its `fetch.ts` export. */
export async function implementedAt(
  effects: DevEffect[] | null,
  dev: DevOptions,
  fetches: Record<string, string>,
  readFile: ((file: string) => Promise<Uint8Array>) | undefined,
): Promise<DevEffect[] | null> {
  if (!effects || !readFile) return effects
  const texts = new Map<string, Promise<string[] | null>>()
  const lines = (file: string) => {
    let text = texts.get(file)
    if (!text) {
      text = readFile(file)
        .then((bytes) => new TextDecoder().decode(bytes).split('\n'))
        .catch(() => null)
      texts.set(file, text)
    }
    return text
  }
  const relative = (file: string) =>
    file.startsWith(`${dev.root}/`) ? file.slice(dev.root.length + 1) : file
  return Promise.all(
    effects.map(async (e) => {
      const dot = e.ref.indexOf('.')
      const sym = literal(e.ref.slice(dot + 1))
      const file = e.runs === 'server' ? dev.app : fetches[e.ref.slice(0, dot)]
      if (!file) return e
      const pattern =
        e.runs === 'server'
          ? new RegExp(`implement\\(\\s*(?:[\\w$]+\\.)?${sym}\\b`)
          : new RegExp(`export const ${sym}\\b`)
      const at = (await lines(file))?.findIndex((l) => pattern.test(l)) ?? -1
      return at < 0 ? e : { ...e, implemented: { file: relative(file), line: at + 1, column: 1 } }
    }),
  )
}
