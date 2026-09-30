import { feature, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { transform } from '../src/transform.ts'

const home = route({ path: '/', params: null, search: null })

async function built(fixture: string) {
  try {
    const mod = (await import(`./fixtures/adr0043/${fixture}.ts`)) as { View: never }
    const b = buildProject(
      project({
        schema: zodAdapter,
        routes: { home },
        pages: [ui.page(home, { views: [mod.View], head: { render: () => ({ title: 'x' }) } })],
        features: [feature({ id: 'f', intent: { summary: 'ADR 0043 H repro' }, declarations: [mod] })],
      }),
      { sources: true },
    )
    return { codes: b.diagnostics.map((d) => d.code), ir: JSON.stringify(b.ir) }
  } catch (error) {
    return { codes: [/HZ\d{3}/.exec(String(error))?.[0] ?? String(error)], ir: '' }
  }
}

describe('ADR 0043 H (authoring)', () => {
  it('ADR 0043 D2: operators in a plain module helper that receives a reference are HZ059', async () => {
    const { codes } = await built('helper')
    expect(codes).toContain('HZ059')
  })

  it('ADR 0043 T2: .length of a fn() result lowers to %length', async () => {
    const { codes, ir } = await built('length')
    expect(codes).toEqual([])
    expect(ir).toContain('"%length"')
  })

  it('ADR 0043 T3: a named fn impl ships the module helpers it calls', () => {
    const code = transform(`import { fn } from '@hozu/core'
import { z } from 'zod'
const hits = (text: string, query: string) => text.includes(query)
const listing = ({ items, query }: { items: string[]; query: string }) => items.filter((s) => hits(s, query))
export const visible = fn({ input: I, output: O, impl: listing })`).code
    expect(/__hozu\.helpers\([\s\S]*?, \{ ([^}]*) \}\)/.exec(code)?.[1] ?? '').toContain('hits: () => hits')
  })

  it('ADR 0043 T5: Boolean(ref) in a builder callback is HZ059, not evaluated on the placeholder', async () => {
    const { codes } = await built('boolean')
    expect(codes).toContain('HZ059')
  })
})

describe('ADR 0043 C (forms, lists)', () => {
  it('ADR 0043 D5: removing a primitive from a list lowers to removeWhere with a null key', async () => {
    const { codes, ir } = await built('picker')
    expect(codes).toEqual([])
    expect(ir).toContain('"removeWhere"')
  })
})
