import { contract, endpoint, event, feature, fn, machine, on, part, project, route, ui } from '@hozu/core'
import { buildProject, codes, type Diagnostic, type DiagnosticCode } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { verify } from '@hozu/validator'
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

const Draft = event({ payload: z.object({ text: z.string() }) })
const Submit = event({ payload: z.object({}) })
const drafts = machine({
  context: z.object({ draft: z.string(), sent: z.boolean() }),
  initialContext: { draft: '', sent: false },
  initial: 'editing',
  states: ({ ctx }) => ({
    editing: {
      on: [
        on(Draft, {
          target: 'editing',
          assign: (e) => {
            ctx.draft = e.text
          },
        }),
        on(Submit, {
          target: 'editing',
          guard: () => ctx.draft !== '',
          assign: () => {
            ctx.sent = true
          },
        }),
      ],
    },
  }),
})
const typesDraft = contract(drafts, {
  given: { state: 'editing' },
  when: [{ send: Draft, payload: { text: 'Hi' } }],
  expect: { state: 'editing', changes: { draft: 'Hi' } },
})
const submits = contract(drafts, {
  given: { state: 'editing', context: { draft: 'Hi' } },
  when: [{ send: Submit, payload: {} }],
  expect: { state: 'editing', changes: { sent: true } },
})
const submitsAgain = contract(drafts, {
  given: { state: 'editing', context: { draft: 'Hi' } },
  when: [{ send: Submit, payload: {} }],
  expect: { state: 'editing', changes: { sent: true } },
})
const refusesEmpty = contract(drafts, {
  given: { state: 'editing' },
  when: [
    { send: Draft, payload: { text: '' } },
    { send: Submit, payload: {} },
  ],
  expect: { state: 'editing' },
})

const verifyWith = (decls: Record<string, unknown>, lock?: unknown) => {
  const build = buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
      features: [feature({ id: 'drafts', intent: { summary: 'lock' }, declarations: [{ ...decls, Home }] })],
    }),
    { sources: true },
  )
  const options = { sources: build.sources, bindings: build.bindings }
  const current = lock === 'current' ? verify(build.ir, options).lock : lock
  return [...build.diagnostics, ...verify(build.ir, { ...options, lock: current }).diagnostics]
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
  {
    name: 'a project with a machine has no hozu.lock.json',
    code: 'HZ057',
    stage: 'lock',
    mistake: () => verifyWith({ Draft, Submit, drafts, submits }, null),
    fixed: () => verifyWith({ Draft, Submit, drafts, submits }, 'current'),
  },
  {
    name: 'a 0.7 (version 1) lock file',
    code: 'HZ057',
    stage: 'lock',
    mistake: () => verifyWith({ Draft, Submit, drafts, submits }, { version: 1, features: {} }),
    fixed: () => verifyWith({ Draft, Submit, drafts, submits }, 'current'),
  },
  {
    name: 'a contract that only fires a copy-only transition',
    code: 'HZ058',
    stage: 'contract',
    mistake: () => verifyWith({ Draft, Submit, drafts, submits, typesDraft }),
    fixed: () => verifyWith({ Draft, Submit, drafts, submits, refusesEmpty }),
  },
  {
    name: 'a contract copied under a second name',
    code: 'HZ064',
    stage: 'contract',
    mistake: () => verifyWith({ Draft, Submit, drafts, submits, submitsAgain }),
    fixed: () => verifyWith({ Draft, Submit, drafts, submits }),
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

  it.each(catalog.filter((c) => c.stage === 'lock' || c.stage === 'contract'))(
    '$code ($stage) reports only itself — $name',
    async ({ code, mistake, fixed }) => {
      expect([...new Set((await mistake()).map((d) => d.code))]).toEqual([code])
      expect(await fixed()).toEqual([])
    },
  )
})
