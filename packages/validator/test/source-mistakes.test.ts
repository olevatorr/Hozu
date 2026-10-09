import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { kitConfigDiagnostics, themeDiagnostics } from '@hozu/cli'
import { contract, endpoint, event, feature, fn, machine, on, part, project, route, ui } from '@hozu/core'
import { buildProject, codes, type Diagnostic, type DiagnosticCode } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { verify } from '@hozu/validator'
import { tv } from '@hozu/variants'
import { tvModule, twMergeConfigOf } from '@hozu/variants/config'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

type Stage = 'transform' | 'runtime' | 'lock' | 'contract' | 'css'

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

const Pressed = event({ payload: z.object({}) })
const pressable = machine({
  context: z.object({ on: z.boolean() }),
  initialContext: { on: false },
  initial: 'idle',
  states: () => ({ idle: { on: [] } }),
})
const Leaky = ui.component({
  tag: 'button',
  render: () => ui.button({ on: { click: ui.send(Pressed, {}) } }, []),
})
const Closed = ui.component({
  tag: 'button',
  events: ['press'],
  render: ({ on }) => ui.button({ on: { click: on.press } }, []),
})
const PressButton = ui.component({
  tag: 'button',
  styles: Object.assign((_?: { tone?: 'on' | 'off' }) => '', {
    variants: { tone: { on: '', off: '' } },
    defaultVariants: { tone: 'off' },
  }),
  props: z.object({ pressed: z.boolean().default(false) }),
  render: ({ props }) => ui.button({ 'aria-pressed': props.pressed }, []),
})
const LeakyUse = ui.view({ render: () => ui.main({}, [ui.use(Leaky, {})]) })
const ClosedUse = ui.view({
  render: () => ui.main({}, [ui.use(Closed, { on: { press: ui.send(Pressed, {}) } })]),
})
const VariantFromRef = ui.view({
  machine: pressable,
  render: ({ ctx }) =>
    ui.main({}, [ui.use(PressButton, { variant: { tone: (ctx.on ? 'on' : 'off') as 'on' } })]),
})
const PropFromRef = ui.view({
  machine: pressable,
  render: ({ ctx }) => ui.main({}, [ui.use(PressButton, { props: { pressed: ctx.on } })]),
})

const card = part((title: string) => ui.article({ class: 'rounded p-4' }, [title]))
const SharedCard = ui.component({
  tag: 'article',
  styles: tv({ base: 'rounded p-4' }),
  props: z.object({ title: z.string() }),
  render: ({ props }) => ui.article({}, [props.title]),
})
const cardKit = ui.kit({ id: 'ui', components: [{ SharedCard }] })
const twoFeatures = (one: () => unknown, two: () => unknown) => {
  const View = (child: () => unknown) => ui.view({ render: () => ui.main({}, [child() as never]) })
  return buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
      kits: [cardKit],
      features: [
        feature({ id: 'one', intent: { summary: 'one' }, declarations: [{ Home, One: View(one) }] }),
        feature({ id: 'two', intent: { summary: 'two' }, declarations: [{ Two: View(two) }] }),
      ],
    }),
    { sources: false },
  ).diagnostics
}

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

const Panel = machine({
  context: z.object({ on: z.boolean() }),
  initialContext: { on: false },
  initial: 'idle',
  states: () => ({ idle: { on: [] } }),
})
const btnStyles = tv({ base: 'rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700' })
const Btn = ui.component({
  tag: 'button',
  styles: btnStyles,
  children: true,
  render: ({ children }) => ui.button({ type: 'button' }, children),
})
const Locked = ui.component({
  tag: 'span',
  styles: tv({ base: 'rounded px-2' }),
  extend: false,
  render: () => ui.span({}, []),
})
const Loud = ui.component({ tag: 'p', styles: tv({ base: 'bg-indigo-600!' }), render: () => ui.p({}, []) })
const Quiet = ui.component({ tag: 'p', styles: tv({ base: 'bg-indigo-600' }), render: () => ui.p({}, []) })
const LoudInside = ui.component({
  tag: 'div',
  render: () => ui.div({}, [ui.span({ class: 'text-white!' }, [])]),
})
const QuietInside = ui.component({
  tag: 'div',
  render: () => ui.div({}, [ui.span({ class: 'text-white' }, [])]),
})
const cardStyles = tv({ base: 'rounded p-4' })
const Card = ui.component({
  tag: 'section',
  styles: cardStyles,
  props: z.object({ title: z.string() }),
  render: ({ props }) => ui.section({}, [ui.h2({ class: 'font-semibold text-slate-900' }, [props.title])]),
})
const Spaced = ui.component({
  tag: 'div',
  styles: tv({ base: 'mt-4 rounded' }),
  render: () => ui.div({}, []),
})
const Unspaced = ui.component({ tag: 'div', styles: tv({ base: 'rounded' }), render: () => ui.div({}, []) })
const AutoMargin = ui.component({
  tag: 'div',
  styles: tv({ base: 'm-auto rounded' }),
  render: () => ui.div({}, []),
})
const Centred = ui.component({
  tag: 'dialog',
  styles: tv({ base: 'm-auto rounded' }),
  render: () => ui.dialog({}, []),
})
const using = (render: () => unknown) => ui.view({ render: () => ui.main({}, [render() as never]) })
const BaseAgainstToggle = ui.view({
  machine: Panel,
  render: ({ ctx }) => ui.main({ class: 'p-4 bg-white', toggle: { 'bg-indigo-600': ctx.on } }, []),
})
const ComplementaryToggles = ui.view({
  machine: Panel,
  render: ({ ctx }) =>
    ui.main({ class: 'p-4', toggle: { 'bg-indigo-600': ctx.on, 'bg-white': !ctx.on } }, []),
})
const OverlappingToggles = ui.view({
  machine: Panel,
  render: ({ ctx }) =>
    ui.main({ class: 'p-4', toggle: { 'text-white': ctx.on, 'text-slate-900': true } }, []),
})
const LiteralToggles = ui.view({
  machine: Panel,
  render: ({ ctx }) =>
    ui.main(
      { class: 'p-4', toggle: { 'text-white': ctx.on === true, 'text-slate-900': ctx.on === false } },
      [],
    ),
})

const styled = async (decls: Record<string, unknown>) => {
  const build = buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
      features: [feature({ id: 'look', intent: { summary: 'styles' }, declarations: [{ ...decls, Home }] })],
    }),
    { sources: true },
  )
  const styles = await compileStyles(build)
  return [
    ...build.diagnostics,
    ...verify(build.ir, {
      sources: build.sources,
      bindings: build.bindings,
      unknownClasses: styles.unknown,
      classes: styles.classes,
    }).diagnostics,
  ]
}

const kitWithTv = async (theme: string[]) => {
  const root = mkdtempSync(join(tmpdir(), 'hozu-kit-'))
  mkdirSync(join(root, 'ui'))
  writeFileSync(
    join(root, 'ui/tv.ts'),
    tvModule('ui', twMergeConfigOf({ theme, utilities: [], functional: [] })),
  )
  const build = buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
      kits: [ui.kit({ id: 'ui', components: [{ Quiet }] })],
      features: [feature({ id: 'look', intent: { summary: 'kit' }, declarations: [{ Home }] })],
    }),
    { sources: false },
  )
  return kitConfigDiagnostics(build, root, fileURLToPath(new URL('../../../package.json', import.meta.url)))
}

const themes = async (kitInk: string) => {
  const root = mkdtempSync(join(tmpdir(), 'hozu-theme-'))
  mkdirSync(join(root, 'ui'))
  writeFileSync(
    join(root, 'app.css'),
    '@import "tailwindcss";\n@theme {\n  --color-ink: oklch(0.2 0 0);\n}\n',
  )
  writeFileSync(join(root, 'ui/theme.css'), `@theme {\n  ${kitInk}: oklch(0.95 0 0);\n}\n`)
  const build = buildProject(
    project({
      schema: zodAdapter,
      styles: pathToFileURL(join(root, 'app.css')),
      routes: { home },
      pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
      kits: [
        ui.kit({ id: 'ui', components: [{ Quiet }], styles: pathToFileURL(join(root, 'ui/theme.css')) }),
      ],
      features: [feature({ id: 'look', intent: { summary: 'kit' }, declarations: [{ Home }] })],
    }),
    { sources: false },
  )
  return themeDiagnostics(build, root)
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
    name: 'a component render sends an event instead of taking it through on',
    code: 'HZ070',
    stage: 'transform',
    mistake: () => buildWith({ Pressed, Leaky, LeakyUse }),
    fixed: () => buildWith({ Pressed, Closed, ClosedUse }),
  },
  {
    name: 'a part returning a view is inlined by two features',
    code: 'HZ080',
    stage: 'transform',
    mistake: () =>
      twoFeatures(
        () => card('Hi'),
        () => card('Ho'),
      ),
    fixed: () =>
      twoFeatures(
        () => ui.use(SharedCard, { props: { title: 'Hi' } }),
        () => ui.use(SharedCard, { props: { title: 'Ho' } }),
      ),
  },
  {
    name: 'a variant is chosen from machine state',
    code: 'HZ071',
    stage: 'transform',
    mistake: () => buildWith({ pressable, PressButton, VariantFromRef }),
    fixed: () => buildWith({ pressable, PressButton, PropFromRef }),
  },
  {
    name: 'a caller class sets a property the component owns',
    code: 'HZ072',
    stage: 'css',
    mistake: () => styled({ Btn, Uses: using(() => ui.use(Btn, { class: 'bg-red-500' }, ['Save'])) }),
    fixed: () => styled({ Btn, Uses: using(() => ui.use(Btn, { class: 'bg-red-500!' }, ['Save'])) }),
  },
  {
    name: 'a caller class on a component declared with extend: false',
    code: 'HZ072',
    stage: 'css',
    mistake: () => styled({ Locked, Uses: using(() => ui.use(Locked, { class: 'w-full' })) }),
    fixed: () => styled({ Locked, Uses: using(() => ui.use(Locked, {})) }),
  },
  {
    name: "a ! in a component's tv config",
    code: 'HZ073',
    stage: 'css',
    mistake: () => styled({ Loud }),
    fixed: () => styled({ Quiet }),
  },
  {
    name: "a ! in an element of a component's render",
    code: 'HZ073',
    stage: 'css',
    mistake: () => styled({ LoudInside }),
    fixed: () => styled({ QuietInside }),
  },
  {
    name: 'the important modifier written first',
    code: 'HZ074',
    stage: 'css',
    mistake: () => styled({ Uses: using(() => ui.div({ class: 'p-4 !bg-red-500' }, [])) }),
    fixed: () => styled({ Uses: using(() => ui.div({ class: 'p-4 bg-red-500!' }, [])) }),
  },
  {
    name: 'a caller colour on a component whose heading sets its own colour',
    code: 'HZ075',
    stage: 'css',
    mistake: () =>
      styled({ Card, Uses: using(() => ui.use(Card, { props: { title: 'Hi' }, class: 'text-white' })) }),
    fixed: () =>
      styled({ Card, Uses: using(() => ui.use(Card, { props: { title: 'Hi' }, class: 'shadow' })) }),
  },
  {
    name: 'a component that sets its own outer margin',
    code: 'HZ076',
    stage: 'css',
    mistake: () => styled({ Spaced, Uses: using(() => ui.use(Spaced, {})) }),
    fixed: () => styled({ Unspaced, Uses: using(() => ui.use(Unspaced, { class: 'mt-4' })) }),
  },
  {
    name: 'a dialog centred by m-auto is not outer spacing (ADR 0079 A2)',
    code: 'HZ076',
    stage: 'css',
    mistake: () => styled({ AutoMargin, Uses: using(() => ui.use(AutoMargin, {})) }),
    fixed: () => styled({ Centred, Uses: using(() => ui.use(Centred, {})) }),
  },
  {
    name: 'a caller shorthand covers longhands the component owns (ADR 0079 A1)',
    code: 'HZ072',
    stage: 'css',
    mistake: () => styled({ Btn, Uses: using(() => ui.use(Btn, { class: 'p-8' }, ['Save'])) }),
    fixed: () => styled({ Btn, Uses: using(() => ui.use(Btn, { class: 'p-8!' }, ['Save'])) }),
  },
  {
    name: 'a ! on a property the component does not own',
    code: 'HZ077',
    stage: 'css',
    mistake: () => styled({ Btn, Uses: using(() => ui.use(Btn, { class: 'w-full!' }, ['Save'])) }),
    fixed: () => styled({ Btn, Uses: using(() => ui.use(Btn, { class: 'w-full' }, ['Save'])) }),
  },
  {
    name: 'a base class and a toggle class set the same property',
    code: 'HZ079',
    stage: 'css',
    mistake: () => styled({ Panel, BaseAgainstToggle }),
    fixed: () => styled({ Panel, ComplementaryToggles }),
  },
  {
    name: 'two static classes set the same property',
    code: 'HZ079',
    stage: 'css',
    mistake: () => styled({ Uses: using(() => ui.div({ class: 'px-4 px-2' }, [])) }),
    fixed: () => styled({ Uses: using(() => ui.div({ class: 'px-4' }, [])) }),
  },
  {
    name: 'two toggles that can hold together set the same property',
    code: 'HZ079',
    stage: 'css',
    mistake: () => styled({ Panel, OverlappingToggles }),
    fixed: () => styled({ Panel, LiteralToggles }),
  },
  {
    name: "a kit's generated tailwind-merge config no longer matches the design system",
    code: 'HZ078',
    stage: 'css',
    mistake: () => kitWithTv(['--text-hero']),
    fixed: () => kitWithTv([]),
  },
  {
    name: 'a kit and the app define one @theme variable with different values (ADR 0079 A4)',
    code: 'HZ094',
    stage: 'css',
    mistake: () => themes('--color-ink'),
    fixed: () => themes('--color-surface'),
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
