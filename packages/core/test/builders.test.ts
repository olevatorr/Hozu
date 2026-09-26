import { event, feature, invoke, machine, mutation, on, op, project, route, ui } from '@tenon/core'
import { buildProject, type DiagnosticCode } from '@tenon/core/ir'
import { zodAdapter } from '@tenon/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Payload = z.object({ n: z.number() })
const Context = z.object({ n: z.number(), label: z.string() })

const base = {
  intent: { summary: 'fixture', invariants: [] },
  styles: [],
  messages: null,
  widgets: {},
  imports: [],
  tags: {},
  events: {},
  queries: {},
  mutations: {},
  fns: {},
  machine: null,
  views: {},
  contracts: {},
  exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
}

const codesOf = (p: unknown) => buildProject(p).diagnostics.map((d) => d.code)

const expectBuildError = (p: unknown, code: DiagnosticCode, message: RegExp) => {
  const found = buildProject(p).diagnostics.filter((d) => d.code === code)
  expect(found.length, `expected ${code}`).toBeGreaterThan(0)
  expect(found[0]!.message).toMatch(message)
  expect(found[0]!.location.source?.file).toMatch(/builders\.test\.ts$/)
  expect(found[0]!.fix === null || typeof found[0]!.fix.summary === 'string').toBe(true)
}

describe('builder diagnostics', () => {
  it('TN013 — one identity registered by two features', () => {
    const Ping = event({ payload: Payload })
    const a = feature({ ...base, id: 'a', events: { Ping } })
    const b = feature({ ...base, id: 'b', events: { Ping } })
    expectBuildError(
      project({
        schema: zodAdapter,
        styles: null,
        http: null,
        notFound: null,
        error: null,
        session: null,
        site: null,
        routes: {},
        pages: [],
        features: [a, b],
      }),
      'TN013',
      /already declared as a\.Ping/,
    )
  })

  it('TN013 — duplicate feature ids', () => {
    const a = feature({ ...base, id: 'a' })
    const b = feature({ ...base, id: 'a' })
    expectBuildError(
      project({
        schema: zodAdapter,
        styles: null,
        http: null,
        notFound: null,
        error: null,
        session: null,
        site: null,
        routes: {},
        pages: [],
        features: [a, b],
      }),
      'TN013',
      /declared twice/,
    )
  })

  it('TN014 — a reference used as a JavaScript value', () => {
    const Ping = event({ payload: Payload })
    const m = machine({
      context: Context,
      initialContext: { n: 0, label: '' },
      initial: 'idle',
      states: ({ ctx }) => ({
        idle: {
          on: [on(Ping, { target: 'idle', assign: (p) => [op.set(ctx.n, (p.n as unknown as number) + 1)] })],
        },
      }),
    })
    const f = feature({ ...base, id: 'f', events: { Ping }, machine: m })
    expectBuildError(
      project({
        schema: zodAdapter,
        styles: null,
        http: null,
        notFound: null,
        error: null,
        session: null,
        site: null,
        routes: {},
        pages: [],
        features: [f],
      }),
      'TN014',
      /used as a JavaScript value/,
    )
  })

  it('TN014 — dynamic class and unknown attributes', () => {
    const m = machine({
      context: Context,
      initialContext: { n: 0, label: '' },
      initial: 'idle',
      states: () => ({ idle: {} }),
    })
    const V = ui.view({
      machine: m,
      route: null,
      render: ({ ctx }) => ui.div({ class: ctx.label as unknown as string, onclick: 'x' } as never, []),
    })
    const diagnostics = buildProject(
      project({
        schema: zodAdapter,
        styles: null,
        http: null,
        notFound: null,
        error: null,
        session: null,
        site: null,
        routes: {},
        pages: [],
        features: [feature({ ...base, id: 'f', machine: m, views: { V } })],
      }),
    ).diagnostics
    expect(diagnostics.map((d) => d.message)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/class must be a static string/),
        expect.stringMatching(/Attribute "onclick"/),
      ]),
    )
  })

  it('TN014 — attributes are checked per tag; style and select value point to the canonical form', () => {
    const V = ui.view({
      machine: null,
      route: null,
      render: () =>
        ui.div({}, [
          ui.a({ href: '/', 'aria-current': 'page', 'data-x': 1, disabled: true } as never, ['x']),
          ui.p({ style: 'color: red' } as never, []),
          ui.select({ value: 'a' } as never, [ui.option({ value: 'a', selected: true }, ['A'])]),
          ui.circle({ cx: 1, fill: 'red', href: '#' } as never, []),
          ui.svg({ viewBox: '0 0 1 1' }, []),
        ]),
    })
    const messages = buildProject(
      project({
        schema: zodAdapter,
        styles: null,
        http: null,
        notFound: null,
        error: null,
        session: null,
        site: null,
        routes: {},
        pages: [],
        features: [feature({ ...base, id: 'f', views: { V } })],
      }),
    ).diagnostics.map((d) => [d.message, d.cause])
    expect(messages).toEqual([
      ['Attribute "disabled" is not allowed on <a>', expect.stringMatching(/^Allowed on <a>: .*href/)],
      ['Attribute "style" is not allowed on <p>', 'Style lives in CSS: use class for static styling.'],
      ['Attribute "value" is not allowed on <select>', expect.stringMatching(/option\(\{ selected/)],
      ['Attribute "href" is not allowed on <circle>', expect.stringMatching(/Allowed on <circle>/)],
    ])
  })

  it('TN029 — widget module that does not exist', () => {
    const Ghost = ui.widget({
      tag: 'div',
      props: z.object({}),
      events: {},
      client: new URL('./missing.client.ts', import.meta.url),
      load: 'visible',
      wraps: false,
    })
    const found = buildProject(
      project({
        schema: zodAdapter,
        styles: null,
        http: null,
        notFound: null,
        error: null,
        session: null,
        site: null,
        routes: {},
        pages: [],
        features: [feature({ ...base, id: 'f', widgets: { Ghost } })],
      }),
    ).diagnostics.filter((d) => d.code === 'TN029')
    expect(found.map((d) => [d.location.pointer, d.message])).toEqual([
      ['/features/f/widgets/Ghost/client', expect.stringMatching(/missing\.client\.ts does not exist$/)],
    ])
  })

  it('TN012 — schema from another vendor', () => {
    const foreign = { '~standard': { version: 1, vendor: 'valibot', validate: () => ({ value: {} }) } }
    const Ping = event({ payload: foreign as never })
    const f = feature({ ...base, id: 'f', events: { Ping } })
    expectBuildError(
      project({
        schema: zodAdapter,
        styles: null,
        http: null,
        notFound: null,
        error: null,
        session: null,
        site: null,
        routes: {},
        pages: [],
        features: [f],
      }),
      'TN012',
      /"valibot" but the project adapter is "zod"/,
    )
  })

  it('TN003 — invoke of a mutation no feature declares', () => {
    const save = mutation({ input: Payload, output: Payload, errors: {}, invalidates: () => [] })
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
        styles: null,
        http: null,
        notFound: null,
        error: null,
        session: null,
        site: null,
        routes: {},
        pages: [],
        features: [feature({ ...base, id: 'f', machine: m })],
      }),
      'TN003',
      /not declared in any feature/,
    )
  })

  it('TN007 — navigation to a route missing from the project', () => {
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
        styles: null,
        http: null,
        notFound: null,
        error: null,
        session: null,
        site: null,
        routes: {},
        pages: [],
        features: [feature({ ...base, id: 'f', events: { Ping }, machine: m })],
      }),
      'TN007',
      /missing from project\(\{ routes \}\)/,
    )
  })

  it('TN014 — reserved error name and empty intent', () => {
    const save = mutation({
      input: Payload,
      output: Payload,
      errors: { Unexpected: Payload },
      invalidates: () => [],
    })
    const f = feature({ ...base, id: 'f', intent: { summary: ' ', invariants: [] }, mutations: { save } })
    expect(
      codesOf(
        project({
          schema: zodAdapter,
          styles: null,
          http: null,
          notFound: null,
          error: null,
          session: null,
          site: null,
          routes: {},
          pages: [],
          features: [f],
        }),
      ),
    ).toEqual(['TN014', 'TN014'])
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
              guard: (p) => op.gt(p.n, 0),
              assign: (p) => [op.set(ctx.pair, { a: p.n, b: 2 })],
            }),
            on(Ping, { target: 'idle', assign: () => [op.set(ctx.pair, { a: 1, b: 2 })] }),
          ],
        },
      }),
    })
    const { ir } = buildProject(
      project({
        schema: zodAdapter,
        styles: null,
        http: null,
        notFound: null,
        error: null,
        session: null,
        site: null,
        routes: {},
        pages: [],
        features: [feature({ ...base, id: 'f', events: { Ping }, machine: m })],
      }),
    )
    const [first, second] = ir.features.f!.machine!.states.idle!.on['f.Ping']!
    expect(first!.assign[0]!.value).toEqual({
      object: { a: { ref: 'event', path: ['n'] }, b: { literal: 2 } },
    })
    expect(second!.assign[0]!.value).toEqual({ literal: { a: 1, b: 2 } })
  })
})
