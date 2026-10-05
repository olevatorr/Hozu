import { event, feature, invoke, machine, mutation, on, part, project, route, ui } from '@hozu/core'
import { buildProject, type DiagnosticCode } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Payload = z.object({ n: z.number() })
const Context = z.object({ n: z.number(), label: z.string() })

const base = { intent: { summary: 'fixture' } }

const codesOf = (p: unknown) => buildProject(p).diagnostics.map((d) => d.code)

const expectBuildError = (p: unknown, code: DiagnosticCode, message: RegExp) => {
  const found = buildProject(p).diagnostics.filter((d) => d.code === code)
  expect(found.length, `expected ${code}`).toBeGreaterThan(0)
  expect(found[0]!.message).toMatch(message)
  expect(found[0]!.location.source?.file).toMatch(/builders\.test\.ts$/)
  expect(found[0]!.fix === null || typeof found[0]!.fix.summary === 'string').toBe(true)
}

describe('builder diagnostics', () => {
  it('HZ013 — one identity registered by two features', () => {
    const Ping = event({ payload: Payload })
    const a = feature({ id: 'a', declarations: [{ Ping }], ...base })
    const b = feature({ id: 'b', declarations: [{ Ping }], ...base })
    expectBuildError(
      project({ schema: zodAdapter, routes: {}, pages: [], features: [a, b] }),
      'HZ013',
      /already declared as a\.Ping/,
    )
  })

  it('HZ013 — duplicate feature ids', () => {
    const a = feature({ id: 'a', declarations: [{}], ...base })
    const b = feature({ id: 'a', declarations: [{}], ...base })
    expectBuildError(
      project({ schema: zodAdapter, routes: {}, pages: [], features: [a, b] }),
      'HZ013',
      /declared twice/,
    )
  })

  it('ordinary TypeScript in callbacks becomes the explicit IR (ADR 0039)', () => {
    const Ping = event({ payload: Payload })
    const m = machine({
      context: Context,
      initialContext: { n: 0, label: '' },
      initial: 'idle',
      states: ({ ctx }) => ({
        idle: {
          on: [
            on(Ping, {
              target: 'idle',
              guard: (p) => p.n > 0 && ctx.label !== 'done',
              assign: (p) => {
                ctx.n += p.n
                ctx.label = `n=${ctx.n}`
              },
            }),
          ],
        },
      }),
    })
    const V = ui.view({
      machine: m,
      render: ({ ctx }) => ui.p({}, [ctx.n > 1 ? 'many' : 'one', ctx.label === '' && ui.span({}, ['empty'])]),
    })
    const b = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'f', declarations: [{ Ping, m, V }], ...base })],
      }),
    )
    expect(b.diagnostics).toEqual([])
    const t = b.ir.features.f!.machine!.states.idle!.on['f.Ping']![0]!
    expect(t.guard).toEqual({
      op: 'and',
      args: [
        { op: 'gt', left: { ref: 'event', path: ['n'] }, right: { literal: 0 } },
        { op: 'neq', left: { ref: 'context', path: ['label'] }, right: { literal: 'done' } },
      ],
    })
    expect(t.assign.map((a) => [a.op, a.path.join('.')])).toEqual([
      ['set', 'n'],
      ['set', 'label'],
    ])
    const root = b.ir.features.f!.views.V!.root as { children: { kind: string }[] }
    expect(root.children.map((c) => c.kind)).toEqual(['if', 'if'])
  })

  it('HZ014 — a method called on a reference names the fix', () => {
    const m = machine({
      context: Context,
      initialContext: { n: 0, label: '' },
      initial: 'idle',
      states: () => ({ idle: {} }),
    })
    const V = ui.view({ machine: m, render: ({ ctx }) => ui.p({}, [ctx.label.toUpperCase()]) })
    const f = feature({ id: 'f', declarations: [{ m, V }], ...base })
    expectBuildError(
      project({ schema: zodAdapter, routes: {}, pages: [], features: [f] }),
      'HZ059',
      /Method "toUpperCase" cannot run on a reference.*fn\(\)/,
    )
  })

  it('HZ014 — dynamic class and unknown attributes', () => {
    const m = machine({
      context: Context,
      initialContext: { n: 0, label: '' },
      initial: 'idle',
      states: () => ({ idle: {} }),
    })
    const V = ui.view({
      machine: m,
      render: ({ ctx }) => ui.div({ class: ctx.label as unknown as string, onclick: 'x' } as never, []),
    })
    const diagnostics = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'f', declarations: [{ V, m }], ...base })],
      }),
    ).diagnostics
    expect(diagnostics.map((d) => d.message)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/class must be a static string/),
        expect.stringMatching(/Attribute "onclick"/),
      ]),
    )
  })

  it('HZ014 — attributes are checked per tag; style and select value point to the canonical form', () => {
    const V = ui.view({
      render: () =>
        ui.div({}, [
          ui.a({ href: '/', 'aria-current': 'page', 'data-x': 1, disabled: true } as never, ['x']),
          ui.p({ style: 'color: red' } as never, []),
          ui.select({ value: 'a' } as never, [ui.option({ value: 'a', selected: true }, ['A'])]),
          ui.circle({ cx: 1, fill: 'red', href: '#' } as never, []),
          ui.svg({ viewBox: '0 0 1 1', role: 'img', 'aria-label': 'Diagram' }, []),
          ui.noscript({}, ['Needs JavaScript']),
        ]),
    })
    const messages = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'f', declarations: [{ V }], ...base })],
      }),
    ).diagnostics.map((d) => [d.message, d.cause])
    expect(messages).toEqual([
      ['Attribute "disabled" is not allowed on <a>', expect.stringMatching(/^Allowed on <a>: .*href/)],
      ['Attribute "style" is not allowed on <p>', 'Style lives in CSS: use class for static styling.'],
      ['Attribute "value" is not allowed on <select>', expect.stringMatching(/option\(\{ selected/)],
      ['Attribute "href" is not allowed on <circle>', expect.stringMatching(/Allowed on <circle>/)],
    ])
  })

  it('HZ029 — a client component module that does not exist', () => {
    const Ghost = ui.component({
      tag: 'div',
      client: new URL('./missing.client.ts', import.meta.url),
      load: 'visible',
      render: () => ui.div({}, []),
    })
    const found = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'f', declarations: [{ Ghost }], ...base })],
      }),
    ).diagnostics.filter((d) => d.code === 'HZ029')
    expect(found.map((d) => [d.location.pointer, d.message])).toEqual([
      ['/features/f/components/Ghost/client', expect.stringMatching(/missing\.client\.ts does not exist$/)],
    ])
  })

  it('HZ012 — schema from another vendor', () => {
    const foreign = { '~standard': { version: 1, vendor: 'valibot', validate: () => ({ value: {} }) } }
    const Ping = event({ payload: foreign as never })
    const f = feature({ id: 'f', declarations: [{ Ping }], ...base })
    expectBuildError(
      project({ schema: zodAdapter, routes: {}, pages: [], features: [f] }),
      'HZ012',
      /"valibot" but the project adapter is "zod"/,
    )
  })

  it('HZ003 — invoke of a mutation no feature declares', () => {
    const save = mutation({
      input: Payload,
      output: Payload,
      invalidates: () => [],
      runs: 'server',
      access: 'anyone',
    })
    const m = machine({
      context: Context,
      initialContext: { n: 0, label: '' },
      initial: 'idle',
      states: ({ ctx }) => ({
        idle: {
          invoke: invoke(save, {
            input: { n: ctx.n },
            done: [{ target: 'idle' }],
            failed: { Unexpected: [{ target: 'idle' }] },
          }),
        },
      }),
    })
    expectBuildError(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'f', declarations: [{ m }], ...base })],
      }),
      'HZ003',
      /not declared in any feature/,
    )
  })

  it('HZ007 — navigation to a route missing from the project', () => {
    const Ping = event({ payload: Payload })
    const away = route({ path: '/away', params: null, search: null })
    const m = machine({
      context: Context,
      initialContext: { n: 0, label: '' },
      initial: 'idle',
      states: () => ({ idle: { on: [on(Ping, { target: 'idle', navigate: () => ui.link(away, null) })] } }),
    })
    expectBuildError(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'f', declarations: [{ Ping, m }], ...base })],
      }),
      'HZ007',
      /missing from project\(\{ routes \}\)/,
    )
  })

  it('HZ014 — reserved error name and empty intent', () => {
    const save = mutation({
      input: Payload,
      output: Payload,
      errors: { Unexpected: Payload },
      invalidates: () => [],
      runs: 'server',
      access: 'anyone',
    })
    const f = feature({ id: 'f', declarations: [{ save }], intent: { summary: ' ' } })
    expect(codesOf(project({ schema: zodAdapter, routes: {}, pages: [], features: [f] }))).toEqual([
      'HZ014',
      'HZ014',
    ])
  })

  it('records literal-only objects as literals and mixed objects as object expressions', () => {
    const Ping = event({ payload: Payload })
    const m = machine({
      context: z.object({ pair: z.object({ a: z.number(), b: z.number() }) }),
      initialContext: { pair: { a: 0, b: 0 } },
      initial: 'idle',
      states: ({ ctx }) => ({
        idle: {
          on: [
            on(Ping, {
              target: 'idle',
              guard: (p) => p.n > 0,
              assign: (p) => {
                ctx.pair = { a: p.n, b: 2 }
              },
            }),
            on(Ping, {
              target: 'idle',
              assign: () => {
                ctx.pair = { a: 1, b: 2 }
              },
            }),
          ],
        },
      }),
    })
    const { ir } = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'f', declarations: [{ Ping, m }], ...base })],
      }),
    )
    const [first, second] = ir.features.f!.machine!.states.idle!.on['f.Ping']!
    expect(first!.assign[0]!.value).toEqual({
      object: { a: { ref: 'event', path: ['n'] }, b: { literal: 2 } },
    })
    expect(second!.assign[0]!.value).toEqual({ literal: { a: 1, b: 2 } })
  })

  it('SVG shapes take their children argument as optional (ADR 0063 D4)', () => {
    const V = ui.view({
      render: () =>
        ui.svg({ viewBox: '0 0 1 1' }, [ui.path({ d: 'M0 0' }), ui.circle({ r: 1 }, [ui.desc({}, ['dot'])])]),
    })
    const b = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'f', declarations: [{ V }], ...base })],
      }),
    )
    expect(b.diagnostics).toEqual([])
    const root = b.ir.features.f!.views.V!.root as { children: { tag: string; children: unknown[] }[] }
    expect(root.children.map((c) => [c.tag, c.children.length])).toEqual([
      ['path', 0],
      ['circle', 1],
    ])
  })
})

describe('busy states by rule (ADR 0037)', () => {
  const Go = event({ payload: Payload })
  const Tick = event({ payload: Payload })
  const save = mutation({
    input: Payload,
    output: Payload,
    errors: {},
    invalidates: () => [],
    runs: 'server',
    access: 'anyone',
  })
  const build = (states: (ctx: any) => any) => {
    const m = machine({
      context: Context,
      initialContext: { n: 0, label: '' },
      initial: 'idle',
      states: ({ ctx }) => states(ctx),
    })
    return buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [feature({ id: 'f', declarations: [{ Go, Tick, save, m }], ...base })],
      }),
    )
  }

  it('a state with invoke drops the events it does not handle, and done / failed accept a state name', () => {
    const b = build(
      part((ctx) => ({
        idle: { on: [on(Go, { target: 'saving' }), on(Tick, { target: 'idle' })] },
        saving: {
          on: [
            on(Tick, {
              target: 'saving',
              assign: (e) => {
                ctx.n = e.n
              },
            }),
          ],
          invoke: invoke(save, {
            input: { n: ctx.n },
            done: 'idle',
            failed: { Unexpected: { target: 'idle' } },
          }),
        },
      })),
    )
    expect(b.diagnostics).toEqual([])
    const saving = b.ir.features.f!.machine!.states.saving!
    expect(saving.ignore).toEqual(['f.Go'])
    expect(saving.invoke!.done).toEqual([{ target: 'idle', guard: null, assign: [], navigate: null }])
    expect(saving.invoke!.failed.Unexpected).toEqual([
      { target: 'idle', guard: null, assign: [], navigate: null },
    ])
  })

  it('HZ014 — ignore listed in a state with invoke, with a patch that removes it', () => {
    const b = build(
      part((ctx) => ({
        idle: { on: [on(Go, { target: 'saving' })] },
        saving: {
          ignore: [Go],
          invoke: invoke(save, { input: { n: ctx.n }, done: 'idle', failed: { Unexpected: 'idle' } }),
        },
      })),
    )
    const d = b.diagnostics.find((x) => x.code === 'HZ014')!
    expect(d.message).toBe('A state with invoke must not list ignore')
    expect(d.fix?.patch).toEqual([{ op: 'remove', path: '/features/f/machine/states/saving/ignore' }])
  })
})

describe('link search folding (ADR 0043 G)', () => {
  const Go = event({ payload: z.object({ tag: z.string() }) })
  const listing = route({
    path: '/',
    params: null,
    search: z.object({ tag: z.string().default(''), page: z.number().default(1) }),
  })
  const navigateOf = (to: unknown) => {
    const m = machine({
      context: Context,
      initialContext: { n: 0, label: '' },
      initial: 'idle',
      states: () => ({ idle: { on: [on(Go, { target: 'idle', navigate: to as never })] } }),
    })
    const { ir, diagnostics } = buildProject(
      project({
        schema: zodAdapter,
        routes: { listing },
        pages: [],
        features: [feature({ id: 'f', declarations: [{ Go, m }], ...base })],
      }),
    )
    expect(diagnostics).toEqual([])
    return ir.features.f!.machine!.states.idle!.on['f.Go']![0]!.navigate
  }
  const omitted = { link: 'listing', params: { literal: null }, search: { literal: null } }

  it('folds literals equal to the defaults, and null, into the omitted search', () => {
    expect(navigateOf(part(() => ui.link(listing, null)))).toEqual(omitted)
    expect(navigateOf(part(() => ui.link(listing, null, { tag: '' })))).toEqual(omitted)
    expect(navigateOf(part(() => ui.link(listing, null, { tag: '', page: 1 })))).toEqual(omitted)
    expect(navigateOf(part(() => ui.link(listing, null, { tag: null as never })))).toEqual(omitted)
    expect(navigateOf(part(() => ui.link(listing, null, {} as never)))).toEqual(omitted)
  })

  it('keeps fields that differ from the default and every non-literal value', () => {
    expect(navigateOf(part(() => ui.link(listing, null, { tag: 'x', page: 1 })))).toEqual({
      ...omitted,
      search: { literal: { tag: 'x' } },
    })
    expect(navigateOf(part((e: { tag: string }) => ui.link(listing, null, { tag: e.tag, page: 1 })))).toEqual(
      {
        ...omitted,
        search: { object: { tag: { ref: 'event', path: ['tag'] } } },
      },
    )
  })
})
