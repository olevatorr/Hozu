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

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/
const measure = (s: string) => [...s].reduce((n, c) => n + (WIDE.test(c) ? 2 : 1), 0)

const wrap = (text: string, width: number, lines: number): string[] => {
  const tokens = text.match(new RegExp(`${WIDE.source}|[^\\s${WIDE.source.slice(1, -1)}]+|\\s+`, 'g')) ?? []
  const out: string[] = []
  let line = ''
  for (const token of tokens) {
    const next = line + token
    if (measure(next.trim()) > width && line.trim()) {
      out.push(line.trim())
      line = token.trim()
    } else line = next
  }
  if (line.trim()) out.push(line.trim())
  if (out.length > lines) {
    out.length = lines
    out[lines - 1] = `${out[lines - 1]!.slice(0, -1)}…`
  }
  return out
}

export function ogSvg({
  title,
  subtitle,
  siteName,
  themeColor,
}: {
  title: string
  subtitle: string | null
  siteName: string | null
  themeColor: string | null
}): string {
  const accent = themeColor && /^#[0-9a-f]{3,8}$/i.test(themeColor) ? themeColor : '#4f46e5'
  const titleLines = wrap(title, 26, 3)
  const subtitleLines = subtitle ? wrap(subtitle, 52, 2) : []
  const tspans = (lines: string[], x: number, first: number, step: number) =>
    lines.map((l, i) => `<tspan x="${x}" y="${first + i * step}">${escapeXml(l)}</tspan>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0f172a"/>
<rect width="1200" height="12" fill="${accent}"/>
<text font-family="Helvetica, Arial, sans-serif" fill="#cbd5e1" font-size="32" font-weight="600">${tspans([siteName ?? ''], 80, 120, 0)}</text>
<text font-family="Helvetica, Arial, sans-serif" fill="#ffffff" font-size="68" font-weight="700">${tspans(titleLines, 80, 250, 82)}</text>
<text font-family="Helvetica, Arial, sans-serif" fill="#94a3b8" font-size="32">${tspans(subtitleLines, 80, 250 + titleLines.length * 82 + 40, 44)}</text>
</svg>`
}

export { wrap as wrapText }

export async function ogImage(card: {
  title: string
  subtitle: string | null
  siteName: string | null
  themeColor: string | null
}): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp(Buffer.from(ogSvg(card)))
      .png()
      .toBuffer(),
  )
}
