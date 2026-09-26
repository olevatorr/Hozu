type Builtins = {
  'node:fs': typeof import('node:fs')
  'node:crypto': typeof import('node:crypto')
  'node:url': typeof import('node:url')
}

export const builtin = <K extends keyof Builtins>(name: K): Builtins[K] | null =>
  (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process?.getBuiltinModule?.(
    name,
  ) as Builtins[K] | null

export const fileUrlToPath = (url: string): string =>
  builtin('node:url')?.fileURLToPath(url) ?? decodeURIComponent(new URL(url).pathname)

export function readFile(path: string): Uint8Array {
  const fs = builtin('node:fs')
  if (!fs)
    throw new Error(`Cannot read ${path}: no file system. Build with \`tenon build\` and pass its manifest.`)
  return fs.readFileSync(path)
}
