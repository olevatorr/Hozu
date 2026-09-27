import { readFile } from 'node:fs/promises'
import { transform } from './transform.ts'

export function hozuTransform() {
  return {
    name: 'hozu-transform',
    setup(build: {
      onLoad(
        options: { filter: RegExp },
        callback: (args: { path: string }) => Promise<{ contents: string; loader: 'ts' } | undefined>,
      ): void
    }) {
      build.onLoad({ filter: /\.(m|c)?ts$/ }, async ({ path }) => {
        if (path.includes('/node_modules/')) return undefined
        const source = await readFile(path, 'utf8')
        const out = transform(source, path)
        return out.changed ? { contents: out.code, loader: 'ts' } : undefined
      })
    },
  }
}
