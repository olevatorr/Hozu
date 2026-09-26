import { brotliDecompressSync, inflateSync } from 'node:zlib'

export interface FontMetrics {
  unitsPerEm: number
  ascent: number
  descent: number
  lineGap: number
  xAvgCharWidth: number
}

const KNOWN = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
]
const NEEDED = ['head', 'hhea', 'OS/2']

type Tables = Map<string, DataView>

const view = (bytes: Uint8Array, offset = 0, length = bytes.length - offset) =>
  new DataView(bytes.buffer, bytes.byteOffset + offset, length)

const tag = (v: DataView, at: number) =>
  String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3))

function sfnt(bytes: Uint8Array): Tables {
  const v = view(bytes)
  const tables: Tables = new Map()
  for (let i = 0; i < v.getUint16(4); i++) {
    const at = 12 + i * 16
    const name = tag(v, at)
    if (NEEDED.includes(name)) tables.set(name, view(bytes, v.getUint32(at + 8), v.getUint32(at + 12)))
  }
  return tables
}

function woff(bytes: Uint8Array): Tables {
  const v = view(bytes)
  const tables: Tables = new Map()
  for (let i = 0; i < v.getUint16(12); i++) {
    const at = 44 + i * 20
    const name = tag(v, at)
    if (!NEEDED.includes(name)) continue
    const offset = v.getUint32(at + 4)
    const compressed = v.getUint32(at + 8)
    const length = v.getUint32(at + 12)
    const raw = bytes.subarray(offset, offset + compressed)
    const data = compressed < length ? new Uint8Array(inflateSync(raw)) : raw
    tables.set(name, view(data))
  }
  return tables
}

function woff2(bytes: Uint8Array): Tables {
  const v = view(bytes)
  const count = v.getUint16(12)
  const compressedSize = v.getUint32(20)
  let at = 48
  const base128 = () => {
    let value = 0
    for (let i = 0; i < 5; i++) {
      const b = v.getUint8(at++)
      value = value * 128 + (b & 0x7f)
      if (!(b & 0x80)) return value
    }
    throw new Error('Invalid UIntBase128')
  }
  const entries: { name: string; length: number }[] = []
  for (let i = 0; i < count; i++) {
    const flags = v.getUint8(at++)
    const index = flags & 0x3f
    const version = flags >> 6
    let name = KNOWN[index] ?? ''
    if (index === 63) {
      name = tag(v, at)
      at += 4
    }
    const original = base128()
    const transformed = name === 'glyf' || name === 'loca' ? version === 0 : version !== 0
    entries.push({ name, length: transformed ? base128() : original })
  }
  const data = new Uint8Array(brotliDecompressSync(bytes.subarray(at, at + compressedSize)))
  const tables: Tables = new Map()
  let offset = 0
  for (const e of entries) {
    if (NEEDED.includes(e.name)) tables.set(e.name, view(data, offset, e.length))
    offset += e.length
  }
  return tables
}

export function fontMetrics(bytes: Uint8Array): FontMetrics | null {
  try {
    const signature = tag(view(bytes), 0)
    const tables = signature === 'wOFF' ? woff(bytes) : signature === 'wOF2' ? woff2(bytes) : sfnt(bytes)
    const head = tables.get('head')
    const hhea = tables.get('hhea')
    const os2 = tables.get('OS/2')
    if (!head || !hhea || !os2) return null
    const typo = os2.byteLength >= 74 && (os2.getUint16(62) & 0x80) !== 0
    return {
      unitsPerEm: head.getUint16(18),
      ascent: typo ? os2.getInt16(68) : hhea.getInt16(4),
      descent: typo ? os2.getInt16(70) : hhea.getInt16(6),
      lineGap: typo ? os2.getInt16(72) : hhea.getInt16(8),
      xAvgCharWidth: os2.getInt16(2),
    }
  } catch {
    return null
  }
}

const LOCAL = {
  Arial: { unitsPerEm: 2048, xAvgCharWidth: 904 },
  'Courier New': { unitsPerEm: 2048, xAvgCharWidth: 1229 },
}

const percent = (x: number) => `${Number((x * 100).toFixed(2))}%`

export function fallbackFace(family: string, m: FontMetrics): string {
  const local = /mono/i.test(family) ? 'Courier New' : 'Arial'
  const ref = LOCAL[local]
  const scale = m.xAvgCharWidth / m.unitsPerEm / (ref.xAvgCharWidth / ref.unitsPerEm)
  const of = (x: number) => percent(Math.abs(x) / m.unitsPerEm / scale)
  return `@font-face{font-family:"${family} Fallback";src:local("${local}");size-adjust:${percent(scale)};ascent-override:${of(m.ascent)};descent-override:${of(m.descent)};line-gap-override:${of(m.lineGap)}}`
}

export function withFallbacks(
  css: string,
  files: Record<string, string>,
  read: (file: string) => Uint8Array,
) {
  const faces: string[] = []
  const families = new Set<string>()
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = /font-family:\s*(["']?)([^;"']+)\1/.exec(block[1]!)?.[2]?.trim()
    const src = /url\((["']?)(a\/[^)"']+)\1\)/.exec(block[1]!)?.[2]
    const file = src ? files[`/_hozu/${src}`] : undefined
    if (!family || !file || families.has(family)) continue
    const metrics = fontMetrics(read(file))
    if (!metrics) continue
    families.add(family)
    faces.push(fallbackFace(family, metrics))
  }
  if (!faces.length) return css
  const stack = /@font-face\s*\{[^}]*\}|(font-family|--font[\w-]*)\s*:([^;}]*)/g
  const out = css.replace(stack, (all, prop: string | undefined, value: string) => {
    if (!prop) return all
    const items = value.split(',')
    const next = items.flatMap((item) => {
      const name = item.trim().replace(/^["']|["']$/g, '')
      return families.has(name) && !value.includes(`${name} Fallback`)
        ? [item, ` "${name} Fallback"`]
        : [item]
    })
    return `${prop}:${next.join(',')}`
  })
  return `${faces.join('\n')}\n${out}`
}
