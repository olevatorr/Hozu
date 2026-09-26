import { readFile } from 'node:fs/promises'
import type { BuildResult, ImageSet, ProjectIR } from '@tenon/core/ir'
import sharp from 'sharp'

export const WIDTHS = [640, 960, 1280, 1920]
const RASTER = /\.(png|jpe?g|webp|avif|gif)$/i

export function imageSources(ir: ProjectIR): Set<string> {
  const found = new Set<string>()
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) {
      for (const item of x) walk(item)
      return
    }
    if (typeof x !== 'object' || x === null) return
    const o = x as Record<string, unknown>
    if (o.kind === 'el' && o.tag === 'img') {
      const src = (o.attrs as Record<string, { literal?: unknown }>).src?.literal
      if (typeof src === 'string') found.add(src)
    }
    for (const v of Object.values(o)) walk(v)
  }
  for (const f of Object.values(ir.features)) walk(f.views)
  return found
}

export async function optimizeImages(
  build: BuildResult,
  { widths = WIDTHS, quality = 80 }: { widths?: number[]; quality?: number } = {},
): Promise<ImageSet> {
  const used = imageSources(build.ir)
  const out: ImageSet = { variants: {}, files: {} }
  for (const [href, asset] of Object.entries(build.bindings.assets)) {
    if (!asset.file || !asset.width || !RASTER.test(href) || !used.has(href)) continue
    const input = await readFile(asset.file)
    const stem = href.replace(/\.[^./]+$/, '')
    const list = [...widths.filter((w) => w < asset.width!), asset.width]
    out.variants[href] = []
    for (const width of list) {
      const variant = `${stem}-${width}.webp`
      out.files[variant] = new Uint8Array(await sharp(input).resize({ width }).webp({ quality }).toBuffer())
      out.variants[href].push({ width, href: variant })
    }
  }
  return out
}
