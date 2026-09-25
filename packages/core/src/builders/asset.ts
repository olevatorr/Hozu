import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256 } from '../canonical/hash.ts'

export const ASSET = Symbol.for('tenon.asset')

export interface AssetFile {
  file: string
  width: number | null
  height: number | null
}

export interface Asset {
  readonly [ASSET]: AssetFile & { href: string }
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

export function asset(url: URL): Asset {
  const file = fileURLToPath(url.href)
  const content = readFileSync(file)
  const size = imageSize(content)
  const href = `/_tenon/a/${sha256(content.toString('base64')).slice(0, 16)}${extname(file).toLowerCase()}`
  return Object.freeze({ [ASSET]: { href, file, width: size?.[0] ?? null, height: size?.[1] ?? null } })
}

export const assetOf = (value: unknown): (AssetFile & { href: string }) | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<Asset>)[ASSET] ?? null) : null
