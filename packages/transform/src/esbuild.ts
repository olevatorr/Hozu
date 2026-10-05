import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { transform } from './transform.ts'

const META_URL = /\bimport\.meta\.url\b/g

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
        const code = out.code.replace(META_URL, JSON.stringify(pathToFileURL(path).href))
        return out.changed || code !== out.code ? { contents: code, loader: 'ts' } : undefined
      })
    },
  }
}
