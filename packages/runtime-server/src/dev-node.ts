import { AmbiguousLine, type BuildResult, type DevNode, type DevOptions, locateNode } from '@hozu/core/ir'

export async function devNode(
  build: BuildResult,
  id: string,
  dev: DevOptions,
  readFile?: (file: string) => Promise<Uint8Array>,
): Promise<DevNode | null> {
  const found = (() => {
    try {
      return locateNode(build, id, dev)
    } catch (error) {
      if (error instanceof AmbiguousLine) return null
      throw error
    }
  })()
  if (!found?.location || !readFile) return found
  try {
    const path = found.location.file.startsWith('/')
      ? found.location.file
      : `${dev.root.replace(/\/$/, '')}/${found.location.file}`
    const all = new TextDecoder().decode(await readFile(path)).split('\n')
    const start = Math.max(1, found.location.line - 3)
    return { ...found, excerpt: { start, lines: all.slice(start - 1, start + 6) } }
  } catch {
    return found
  }
}
