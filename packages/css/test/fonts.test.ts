import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { brotliCompressSync, deflateSync } from 'node:zlib'
import { feature, project, route, ui } from '@tenon/core'
import { buildProject } from '@tenon/core/ir'
import { compileStyles, fallbackFace, fontMetrics } from '@tenon/css'
import { zodAdapter } from '@tenon/schema-zod'
import { describe, expect, it } from 'vitest'

const tables = () => {
  const head = Buffer.alloc(54)
  head.writeUInt16BE(1000, 18)
  const hhea = Buffer.alloc(36)
  hhea.writeInt16BE(900, 4)
  hhea.writeInt16BE(-250, 6)
  hhea.writeInt16BE(0, 8)
  const os2 = Buffer.alloc(78)
  os2.writeInt16BE(500, 2)
  return { head, hhea, 'OS/2': os2 } as Record<string, Buffer>
}

const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)])

function ttf(): Buffer {
  const entries = Object.entries(tables())
  const header = Buffer.alloc(12 + entries.length * 16)
  header.writeUInt32BE(0x00010000, 0)
  header.writeUInt16BE(entries.length, 4)
  let offset = header.length
  const bodies: Buffer[] = []
  entries.forEach(([tag, data], i) => {
    header.write(tag, 12 + i * 16, 'latin1')
    header.writeUInt32BE(offset, 12 + i * 16 + 8)
    header.writeUInt32BE(data.length, 12 + i * 16 + 12)
    bodies.push(pad(data))
    offset += pad(data).length
  })
  return Buffer.concat([header, ...bodies])
}

function woff(): Buffer {
  const entries = Object.entries(tables())
  const header = Buffer.alloc(44 + entries.length * 20)
  header.write('wOFF', 0, 'latin1')
  header.writeUInt16BE(entries.length, 12)
  let offset = header.length
  const bodies: Buffer[] = []
  entries.forEach(([tag, data], i) => {
    const compressed = deflateSync(data)
    const at = 44 + i * 20
    header.write(tag, at, 'latin1')
    header.writeUInt32BE(offset, at + 4)
    header.writeUInt32BE(compressed.length, at + 8)
    header.writeUInt32BE(data.length, at + 12)
    bodies.push(pad(compressed))
    offset += pad(compressed).length
  })
  return Buffer.concat([header, ...bodies])
}

function woff2(): Buffer {
  const known: Record<string, number> = { head: 1, hhea: 2, 'OS/2': 6 }
  const entries = Object.entries(tables())
  const directory = Buffer.concat(entries.map(([tag, data]) => Buffer.from([known[tag]!, data.length])))
  const compressed = brotliCompressSync(Buffer.concat(entries.map(([, data]) => data)))
  const header = Buffer.alloc(48)
  header.write('wOF2', 0, 'latin1')
  header.writeUInt16BE(entries.length, 12)
  header.writeUInt32BE(compressed.length, 20)
  return Buffer.concat([header, directory, compressed])
}

const expected = {
  unitsPerEm: 1000,
  ascent: 900,
  descent: -250,
  lineGap: 0,
  xAvgCharWidth: 500,
}

describe('font fallback metrics (ADR 0020)', () => {
  it('reads head, hhea and OS/2 from TTF, WOFF and WOFF2', () => {
    for (const font of [ttf(), woff(), woff2()]) expect(fontMetrics(new Uint8Array(font))).toEqual(expected)
    expect(fontMetrics(new Uint8Array(Buffer.from('wOF2fake')))).toBeNull()
  })

  it('scales Arial to the average width and derives the vertical overrides', () => {
    expect(fallbackFace('Inter', expected)).toBe(
      '@font-face{font-family:"Inter Fallback";src:local("Arial");size-adjust:113.27%;ascent-override:79.45%;descent-override:22.07%;line-gap-override:0%}',
    )
    expect(fallbackFace('Fira Mono', expected)).toContain('src:local("Courier New")')
  })

  it.skipIf(!existsSync('/System/Library/Fonts/Supplemental/Arial.ttf'))(
    'Arial against itself is 100%',
    () => {
      const arial = fontMetrics(new Uint8Array(readFileSync('/System/Library/Fonts/Supplemental/Arial.ttf')))
      expect(fallbackFace('Arial', arial!)).toContain('size-adjust:100%')
    },
  )

  it('adds the fallback face and puts it right after the family in every font stack', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tenon-fonts-'))
    writeFileSync(join(dir, 'inter.woff2'), woff2())
    writeFileSync(
      join(dir, 'app.css'),
      '@import "tailwindcss";\n@font-face { font-family: Inter; src: url("./inter.woff2") format("woff2"); }\n@theme { --font-sans: Inter, ui-sans-serif, sans-serif; }\n',
    )
    const home = route({ path: '/', params: null, search: null })
    const Page = ui.view({ render: () => ui.p({ class: 'font-sans' }, ['Hi']) })
    const site = project({
      schema: zodAdapter,
      styles: pathToFileURL(join(dir, 'app.css')),
      routes: { home },
      pages: [
        ui.page(home, { views: [Page], head: { render: () => ({ title: 'Fonts', description: 'Fonts' }) } }),
      ],
      features: [feature({ id: 'site', intent: { summary: 'Fonts' }, declarations: { Page } })],
    })
    const styles = await compileStyles(buildProject(site, { sources: false }), { base: dir })
    expect(styles.css).toMatch(/font-family:"?Inter Fallback"?;src:local\("?Arial"?\);size-adjust:113\.27%/)
    expect(styles.css).toMatch(/--font-sans:Inter,\s*"Inter Fallback",\s*ui-sans-serif/)
    expect(styles.css).toMatch(/@font-face\{font-family:Inter;src:url\(a\/[0-9a-f]{16}\.woff2\)/)
  })
})
