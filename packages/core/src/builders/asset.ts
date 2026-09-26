import { sha256 } from '../canonical/hash.ts'
import { fileUrlToPath, readFile } from '../platform.ts'

export const ASSET = Symbol.for('hozu.asset')

export interface AssetFile {
  file: string | null
  width: number | null
  height: number | null
}

export interface Asset {
  readonly [ASSET]: { url: string }
}

const be16 = (b: Buffer, i: number) => b.readUInt16BE(i)

export function imageSize(b: Buffer): [number, number] | null {
  if (b.length > 24 && b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)]
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return [b.readUInt16LE(6), b.readUInt16LE(8)]
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16)
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21)
      return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]
    }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null
      const marker = b[i + 1]!
      const size = be16(b, i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return [be16(b, i + 7), be16(b, i + 5)]
      i += 2 + size
    }
  }
  const svg = b.toString('utf8', 0, Math.min(b.length, 2048))
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0]
  if (tag) {
    const w = /\bwidth="(\d+(?:\.\d+)?)(px)?"/.exec(tag)?.[1]
    const h = /\bheight="(\d+(?:\.\d+)?)(px)?"/.exec(tag)?.[1]
    if (w && h) return [Number(w), Number(h)]
    const box = /\bviewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/.exec(tag)
    if (box) return [Number(box[1]), Number(box[2])]
  }
  return null
}

export const asset = (url: URL): Asset => Object.freeze({ [ASSET]: { url: url.href } })

export const assetUrl = (value: unknown): string | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<Asset>)[ASSET]?.url ?? null) : null

export const assetName = (url: string): string => decodeURIComponent(url.slice(url.lastIndexOf('/') + 1))

export function readAsset(url: string): AssetFile & { href: string } {
  const file = fileUrlToPath(url)
  const content = readFile(file) as Buffer
  const size = imageSize(content)
  const ext = /\.[^./]+$/.exec(file)?.[0].toLowerCase() ?? ''
  const href = `/_hozu/a/${sha256(content.toString('base64')).slice(0, 16)}${ext}`
  return { href, file, width: size?.[0] ?? null, height: size?.[1] ?? null }
}
