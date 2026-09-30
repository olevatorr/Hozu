import { feature, fn, project, route, ui } from '@hozu/core'
import { buildProject, codes, type Diagnostic, type DiagnosticCode } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

type Stage = 'transform' | 'runtime' | 'lock' | 'contract'

interface SourceMistake {
  name: string
  code: DiagnosticCode
  stage: Stage
  mistake: () => Diagnostic[] | Promise<Diagnostic[]>
  fixed: () => Diagnostic[] | Promise<Diagnostic[]>
}

const home = route({ path: '/', params: null, search: null })
const Home = ui.view({ render: () => ui.main({}, ['Home']) })
const SUFFIX = '!'
const excited = (s: string) => `${s}${SUFFIX}`
let counter = 0

const counting = fn({
  input: z.object({ text: z.string() }),
  output: z.string(),
  impl: ({ text }) => `${text}${counter}`,
})
const selfContained = fn({
  input: z.object({ text: z.string() }),
  output: z.string(),
  impl: ({ text }) => excited(text),
})

const buildWith = (fns: Record<string, unknown>) =>
  buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
      features: [feature({ id: 'text', intent: { summary: 'fns' }, declarations: [{ ...fns, Home }] })],
    }),
    { sources: false },
  ).diagnostics

const catalog: SourceMistake[] = [
  {
    name: 'a fn body reads mutable module state',
    code: 'HZ047',
    stage: 'transform',
    mistake: () => {
      counter++
      return buildWith({ counting })
    },
    fixed: () => buildWith({ selfContained }),
  },
]

describe('ADR 0043 source-level mistake catalog', () => {
  it('has at least one case and no duplicates', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(1)
    expect(new Set(catalog.map((c) => `${c.code} ${c.name}`)).size).toBe(catalog.length)
  })

  it.each(catalog)('$code ($stage) — $name', async ({ code, mistake, fixed }) => {
    const found = (await mistake()).filter((d) => d.code === code)
    expect(found.length, `expected ${code}`).toBeGreaterThan(0)
    for (const d of found) {
      expect(d.severity).toBe(codes[code].severity)
      expect(d.location.pointer).toMatch(/^\//)
      expect(d.fix?.summary, `${code} needs a fix`).toBeTruthy()
      expect(
        (d.fix?.patch?.length ?? 0) > 0 || Boolean(d.fix?.snippet),
        `${code} at ${d.location.pointer} needs a patch or a snippet`,
      ).toBe(true)
    }
    expect((await fixed()).filter((d) => d.code === code)).toEqual([])
  })
})
