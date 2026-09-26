import { event, feature, machine, on, op, project, ui } from '@tenon/core'
import { buildProject } from '@tenon/core/ir'
import { zodAdapter } from '@tenon/schema-zod'
import { validate } from '@tenon/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Priority = z.enum(['low', 'normal', 'high'])
const Pick = event({ payload: z.object({ priority: Priority }) })
const Count = event({ payload: z.object({ n: z.number() }) })
const Save = event({ payload: z.object({}) })

const board = (options: { busyIgnores: boolean; select: string[]; field: 'enum' | 'number' }) => {
  const m = machine({
    context: z.object({ priority: Priority, n: z.number() }),
    initialContext: { priority: 'normal', n: 0 },
    initial: 'idle',
    states: ({ ctx }) => ({
      idle: {
        on: [
          on(Pick, { target: 'idle', assign: (p) => [op.set(ctx.priority, p.priority)] }),
          on(Count, { target: 'idle' }),
          on(Save, { target: 'busy' }),
        ],
      },
      busy: {
        ignore: options.busyIgnores ? [Pick, Count] : [],
        on: [on(Save, { target: 'idle' })],
      },
    }),
  })
  const View = ui.view({
    machine: m,
    route: null,
    render: () =>
      ui.div({}, [
        ui.select(
          {
            'aria-label': 'Priority',
            on: {
              change:
                options.field === 'enum'
                  ? ui.send(Pick, { priority: ui.dom.value })
                  : ui.send(Count, { n: ui.dom.value }),
            },
          },
          options.select.map((v) => ui.option({ value: v }, [v])),
        ),
        ui.button({ type: 'button', on: { click: ui.send(Save, {}) } }, ['Save']),
      ]),
  })
  const f = feature({
    id: 'board',
    intent: { summary: 'fixture', invariants: [] },
    styles: [],
    messages: null,
    widgets: {},
    imports: [],
    tags: {},
    events: { Pick, Count, Save },
    queries: {},
    mutations: {},
    fns: {},
    machine: m,
    views: { View },
    contracts: {},
    exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
  })
  return buildProject(
    project({
      schema: zodAdapter,
      styles: null,
      http: null,
      env: null,
      notFound: null,
      error: null,
      session: null,
      site: null,
      routes: {},
      pages: [],
      features: [f],
    }),
  )
}

const codes = (b: ReturnType<typeof board>, only: string[]) =>
  validate(b.ir, { sources: b.sources })
    .filter((d) => only.includes(d.code))
    .map((d) => [d.code, d.message])

describe('ADR 0013 ergonomics', () => {
  it('ignore satisfies TN005; without it, TN005 offers the ignore patch', () => {
    expect(
      codes(board({ busyIgnores: true, select: ['low', 'normal', 'high'], field: 'enum' }), ['TN005']),
    ).toEqual([])
    const b = board({ busyIgnores: false, select: ['low', 'normal', 'high'], field: 'enum' })
    const found = validate(b.ir, { sources: b.sources }).filter((d) => d.code === 'TN005')
    expect(found.map((d) => d.fix?.patch)).toContainEqual([
      { op: 'add', path: '/features/board/machine/states/busy/ignore/-', value: 'board.Pick' },
    ])
    expect(b.ir.features.board!.machine!.states.busy!.ignore).toEqual([])
  })

  it('TN033 — a select whose literal options are enum members may send ui.dom.value into the enum', () => {
    expect(
      codes(board({ busyIgnores: true, select: ['low', 'normal', 'high'], field: 'enum' }), ['TN033']),
    ).toEqual([])
    expect(codes(board({ busyIgnores: true, select: ['low', 'urgent'], field: 'enum' }), ['TN033'])).toEqual([
      ['TN033', 'ui.dom.value may not be one of "low", "normal", "high" (board.Pick.priority)'],
    ])
    expect(codes(board({ busyIgnores: true, select: ['1', '2'], field: 'number' }), ['TN033'])).toEqual([
      ['TN033', 'ui.dom.value is text, but board.Count.n is a number'],
    ])
  })

  it('TN034 — a state that both handles and ignores an event', () => {
    const b = board({ busyIgnores: true, select: ['low'], field: 'enum' })
    b.ir.features.board!.machine!.states.busy!.ignore.push('board.Save')
    expect(codes(b, ['TN034'])).toEqual([['TN034', 'State "busy" both handles and ignores board.Save']])
  })
})

describe('ADR 0014 judgement codes', () => {
  it('TN036 — a form whose payload the server cannot evaluate; TN035 — search without defaults', async () => {
    const { buildProject: build } = await import('@tenon/core/ir')
    const b = build((await import('../../../examples/bookmarks/tenon.config.ts')).default)
    const ir = structuredClone(b.ir)
    const form = (
      ir.features.bookmarks!.views.Board!.root as {
        children: { tag?: string; on?: Record<string, { payload: unknown }> }[]
      }
    ).children.find((c) => c.tag === 'form')!
    form.on!.submit!.payload = {
      object: { title: { ref: 'dom', path: ['value'] }, kind: { literal: 'video' } },
    }
    ir.routes.home!.search = { type: 'object', properties: { show: { type: 'string' } } }
    const found = validate(ir, { sources: b.sources }).filter((d) => d.code === 'TN036' || d.code === 'TN035')
    expect(found.map((d) => [d.code, d.severity, d.location.pointer])).toEqual([
      ['TN035', 'error', '/routes/home/search/properties/show'],
      ['TN036', 'warning', '/features/bookmarks/views/Board/root/children/1/on/submit/payload'],
    ])
  })
})
