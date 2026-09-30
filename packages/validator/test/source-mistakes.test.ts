import { endpoint, event, feature, fn, machine, on, part, project, route, ui } from '@hozu/core'
import { buildProject, codes, type Diagnostic, type DiagnosticCode } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
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

const Row = z.object({ id: z.string(), done: z.boolean() })
const rows = machine({
  context: z.object({ rows: z.array(Row) }),
  initialContext: { rows: [] },
  initial: 'ready',
  states: () => ({ ready: {} }),
})
const plainStatus = (row: z.infer<typeof Row>) => ui.span({}, [row.done ? 'Done' : 'Open'])
const partStatus = part((row: z.infer<typeof Row>) => ui.span({}, [row.done ? 'Done' : 'Open']))
const PartList = ui.view({
  machine: rows,
  render: ({ ctx }) => ui.ul({}, [ui.each(ctx.rows, 'id', (row) => ui.li({}, [partStatus(row)]))]),
})
const PlainList = ui.view({
  machine: rows,
  render: ({ ctx }) => ui.ul({}, [ui.each(ctx.rows, 'id', (row) => ui.li({}, [plainStatus(row)]))]),
})

const Toggle = event({ payload: z.object({ id: z.string() }) })
const guardedRows = (guard: (e: { id: string }) => boolean) =>
  machine({
    context: z.object({ rows: z.array(Row) }),
    initialContext: { rows: [] },
    initial: 'ready',
    states: () => ({ ready: { on: [on(Toggle, { target: 'ready', guard })] } }),
  })
const labelled = (label: (row: z.infer<typeof Row>) => string) =>
  ui.view({
    machine: rows,
    render: ({ ctx }) => ui.ul({}, [ui.each(ctx.rows, 'id', (row) => ui.li({}, [label(row)]))]),
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

const report = endpoint({ method: 'GET', path: '/api/report', input: z.object({}), output: 'response' })
const served = async (body: string, type: string) => {
  const p = project({
    schema: zodAdapter,
    routes: { home },
    pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
    features: [feature({ id: 'api', intent: { summary: 'report' }, declarations: [{ report, Home }] })],
  })
  const found: Diagnostic[] = []
  const handler = createHandler({
    build: buildProject(p, { sources: false }),
    resolvers: resolvers(p, (implement) => [
      implement(report, () => new Response(body, { headers: { 'content-type': type } })),
    ]),
    onError: (error) => {
      const d = (error as { diagnostic?: Diagnostic }).diagnostic
      if (d) found.push(d)
    },
  })
  await handler.fetch(new Request('http://x.test/api/report'))
  return found
}

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
  {
    name: 'a plain helper receives a reference and runs ?: on the placeholder',
    code: 'HZ059',
    stage: 'transform',
    mistake: () => buildWith({ rows, PlainList }),
    fixed: () => buildWith({ rows, PartList }),
  },
  {
    name: 'an inline arrow reaches a builder through a local helper and is never lowered',
    code: 'HZ059',
    stage: 'transform',
    mistake: () => buildWith({ Toggle, forwarded: guardedRows((e) => e.id !== '') }),
    fixed: () => buildWith({ Toggle, forwarded: guardedRows(part((e: { id: string }) => e.id !== '')) }),
  },
  {
    name: 'a local helper calls an inline arrow with a reference',
    code: 'HZ059',
    stage: 'transform',
    mistake: () => buildWith({ rows, Labelled: labelled((row) => (row.done ? 'Done' : 'Open')) }),
    fixed: () =>
      buildWith({
        rows,
        Labelled: labelled(part((row: z.infer<typeof Row>) => (row.done ? 'Done' : 'Open'))),
      }),
  },
  {
    name: 'an endpoint answers a hand-written HTML page',
    code: 'HZ053',
    stage: 'runtime',
    mistake: () => served('<h1>Admin</h1>', 'text/html; charset=utf-8'),
    fixed: () => served('id,title\n', 'text/csv'),
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
