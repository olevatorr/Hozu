import { event, feature, machine, on, part, project, route, ui } from '@hozu/core'
import { buildProject, hashJson, routeTable } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { compileMachine, init, transition } from '@hozu/machine'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { verify } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { board, Note } from './fixtures/adr0043/board.ts'
import * as shared from './fixtures/adr0043/shared.ts'
import { dump, pinnedBadge, plainBadge, titleOf } from './fixtures/adr0043/shared.ts'

const home = route({ path: '/', params: null, search: null })
const noteRoute = route({ path: '/notes/:id', params: z.object({ id: z.string() }), search: null })

const build = (declarations: object, extra: object[] = []) =>
  buildProject(
    project({
      schema: zodAdapter,
      routes: { home, noteRoute },
      pages: [ui.page(home, { views: [], head: { render: () => ({ title: 'x' }) } })],
      features: [
        feature({ id: 'f', intent: { summary: 'ADR 0043 H' }, declarations: [declarations] }),
        ...(extra as never[]),
      ],
    }),
    { sources: true },
  )
const codes = (b: ReturnType<typeof build>) => b.diagnostics.map((d) => d.code)

const row = part((note: Note) => ui.li({}, [note.text, note.pinned ? ' Unpin' : ' Pin']))
const label = part((note: Note) => (note.pinned ? 'Unpin' : 'Pin'))
const nonEmpty = part((text: string) => text !== '' && text !== ' ')

describe('part() (ADR 0043 H, gate G11)', () => {
  it('builds the same IR as the inline form, for a subtree, a value and a guard', () => {
    const viaPart = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) =>
          ui.ul({}, [
            ui.each(ctx.notes, 'id', (note) => ui.div({}, [row(note), label(note), pinnedBadge(note)])),
          ]),
      }),
    })
    const inline = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) =>
          ui.ul({}, [
            ui.each(ctx.notes, 'id', (note) =>
              ui.div({}, [
                ui.li({}, [note.text, note.pinned ? ' Unpin' : ' Pin']),
                note.pinned ? 'Unpin' : 'Pin',
                note.pinned && ui.span({ class: 'badge' }, ['pinned']),
              ]),
            ),
          ]),
      }),
    })
    expect(codes(viaPart)).toEqual([])
    expect(codes(inline)).toEqual([])
    expect(hashJson(viaPart.ir)).toBe(hashJson(inline.ir))

    const Edit = event({ payload: z.object({ text: z.string() }) })
    const guarded = (guard: (e: { text: string }) => boolean) =>
      build({
        Edit,
        editor: machine({
          context: z.object({ text: z.string() }),
          initialContext: { text: '' },
          initial: 'idle',
          states: ({ ctx }) => ({
            idle: {
              on: [
                on(Edit, {
                  target: 'idle',
                  guard,
                  assign: (e) => {
                    ctx.text = e.text
                  },
                }),
              ],
            },
          }),
        }),
      })
    const a = guarded(part((e: { text: string }) => nonEmpty(e.text)))
    const b = guarded(part((e: { text: string }) => e.text !== '' && e.text !== ' '))
    expect(a.ir.features.f!.machine!.states.idle!.on['f.Edit']![0]!.guard).toEqual({
      op: 'and',
      args: [
        { op: 'neq', left: { ref: 'event', path: ['text'] }, right: { literal: '' } },
        { op: 'neq', left: { ref: 'event', path: ['text'] }, right: { literal: ' ' } },
      ],
    })
    expect(hashJson(a.ir)).toBe(hashJson(b.ir))
  })

  it('is listed with its name and file:line, per feature that inlines it', () => {
    const b = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) => ui.ul({}, [ui.each(ctx.notes, 'id', (n) => row(n))]),
      }),
    })
    const [use] = [...b.parts]
    expect(use).toMatchObject({ name: 'row', features: ['f'] })
    expect(use!.source?.file).toMatch(/authoring\.test\.ts$/)
  })

  it('HZ006 at record time when it uses a declaration the calling feature may not use', () => {
    const Pin = event({ payload: z.object({ id: z.string() }) })
    const pinButton = part((id: string) =>
      ui.button({ type: 'button', on: { click: ui.send(Pin, { id }) } }, ['Pin']),
    )
    const Other = ui.view({ render: () => ui.div({}, [pinButton('a')]) })
    const owner = (exports: object[]) =>
      feature({ id: 'a', intent: { summary: 'owner' }, declarations: [{ Pin }], exports: exports as never })
    const closed = owner([])
    const blocked = build({}, [
      closed,
      feature({ id: 'b', intent: { summary: 'x' }, declarations: [{ Other }] }),
    ])
    const found = blocked.diagnostics.filter((d) => d.code === 'HZ006' && d.message.startsWith('pinButton'))
    expect(found).toHaveLength(1)
    expect(found[0]!.message).toMatch(/pinButton \(authoring\.test\.ts:\d+\) uses a\.Pin/)

    const open = owner([Pin])
    const allowed = build({}, [
      open,
      feature({ id: 'b', intent: { summary: 'x' }, declarations: [{ Other }], imports: [open] }),
    ])
    expect(codes(allowed)).toEqual([])
    expect(verify(allowed.ir, { bindings: allowed.bindings }).diagnostics.map((d) => d.code)).not.toContain(
      'HZ006',
    )
  })
})

const helperRow = (note: Note) => ui.li({}, [note.pinned ? 'Unpin' : 'Pin'])

describe('HZ059 reference-escape', () => {
  it('lists every static site of one view: a plain helper, globals, typeof and a plain callback', () => {
    const b = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) =>
          ui.div({}, [
            ui.ul({}, [ui.each(ctx.notes, 'id', (note) => helperRow(note))]),
            ui.ul({}, [ui.each(ctx.notes, 'id', helperRow)]),
            // biome-ignore lint/complexity/noExtraBooleanCast: the mistake under test
            Boolean(ctx.error) ? 'error' : 'fine',
            Array.isArray(ctx.notes) ? 'list' : 'none',
            typeof ctx.error === 'string' ? 'text' : 'none',
          ]),
      }),
    })
    const found = b.diagnostics.filter((d) => d.code === 'HZ059')
    const d = found.find((x) => x.message.startsWith('References are evaluated as JavaScript'))
    expect(found.filter((x) => x === d || x.message.startsWith('This callback was not lowered'))).toEqual(
      found,
    )
    for (const name of ['helperRow', 'Boolean', 'Array.isArray', 'typeof ctx.error'])
      expect(d!.message).toContain(`\`${name}\``)
    expect(d!.message).toMatch(/a plain function is used as a builder callback/)
    expect(d!.location.source?.file).toMatch(/authoring\.test\.ts$/)
    expect(d!.fix?.snippet).toContain('part(')
  })

  it('reports an imported plain helper at record time, and accepts imported parts and fns', () => {
    const bad = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) => ui.ul({}, [ui.each(ctx.notes, 'id', (note) => ui.li({}, [plainBadge(note)]))]),
      }),
    })
    const d = bad.diagnostics.find((x) => x.code === 'HZ059')
    expect(d?.message).toMatch(/`plainBadge` is a plain function and received a reference/)
    expect(d?.location.source?.file).toMatch(/authoring\.test\.ts$/)
    const good = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) =>
          ui.ul({}, [
            ui.each(ctx.notes, 'id', (note) =>
              ui.li({}, [pinnedBadge(note), `${shared.shout({ text: note.text })}!`]),
            ),
          ]),
      }),
    })
    expect(codes(good)).toEqual([])
    expect(JSON.stringify(good.ir)).toContain('"f.shout"')
  })

  it('traps keys, `in` and conversions of a reference while recording', () => {
    const spread = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) => ui.p({}, [String(Object.keys({ ...ctx }).length)]),
      }),
    })
    expect(codes(spread)).toContain('HZ059')
    const has = build({
      board,
      shout: shared.shout,
      Board: ui.view({ machine: board, render: ({ ctx }) => ui.p({}, ['notes' in ctx ? 'yes' : 'no']) }),
    })
    const d = has.diagnostics.find((x) => x.code === 'HZ059')
    expect(d?.message).toMatch(/"notes" in/)
    expect(d?.location.source?.file).toMatch(/authoring\.test\.ts$/)
  })

  it('stops the server like HZ044 and HZ047', () => {
    const b = build({
      board,
      shout: shared.shout,
      Board: ui.view({ machine: board, render: ({ ctx }) => ui.p({}, [String(ctx.error)]) }),
    })
    expect(() => createHandler({ build: b, resolvers: resolvers(project({} as never), () => []) })).toThrow(
      /evaluated as JavaScript/,
    )
  })
})

describe('record-time traps catch what no static check sees', () => {
  const viaBag = (format: (bag: Note[]) => string) =>
    build({
      board,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) => {
          const bag: Note[] = []
          bag.push(ctx.notes[0]!)
          return ui.p({}, [format(bag)])
        },
      }),
    })

  it('an imported plain helper that interpolates a reference in a template string', () => {
    const d = viaBag(titleOf).diagnostics.find((x) => x.code === 'HZ059')
    expect(d?.message).toMatch(
      /Reference "notes\.0\.text" was evaluated as JavaScript \(it was converted to a string/,
    )
    expect(d?.location.source?.file).toMatch(/fixtures\/adr0043\/shared\.ts$/)
  })

  it('an imported plain helper that JSON.stringify-s a reference', () => {
    const d = viaBag(dump).diagnostics.find((x) => x.code === 'HZ059')
    expect(d?.message).toMatch(/Reference "notes\.0" was evaluated as JavaScript \(JSON\.stringify\)/)
    expect(d?.location.source?.file).toMatch(/fixtures\/adr0043\/shared\.ts$/)
  })
})

describe('call results are expressions (T2)', () => {
  it('.length lowers to %length and any other member throws', () => {
    const ok = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) => ui.p({}, [`${shared.shout({ text: ctx.notes[0]!.text }).length}`]),
      }),
    })
    expect(codes(ok)).toEqual([])
    expect(JSON.stringify(ok.ir)).toContain('"%length"')
    const bad = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) => ui.p({}, [(shared.shout({ text: ctx.notes[0]!.text }) as any).trim]),
      }),
    })
    expect(bad.diagnostics.find((d) => d.code === 'HZ059')?.message).toMatch(/"\.trim" was read/)
  })
})

describe('record-time normalisation (one meaning, one IR)', () => {
  const Go = event({ payload: z.object({ n: z.number(), on: z.boolean() }) })
  const counter = (guard: (e: any) => boolean) =>
    build({
      Go,
      counter: machine({
        context: z.object({ n: z.number() }),
        initialContext: { n: 0 },
        initial: 'idle',
        states: () => ({ idle: { on: [on(Go, { target: 'idle', guard })] } }),
      }),
    })
  const first = (b: ReturnType<typeof build>) => b.ir.features.f!.machine!.states.idle!.on['f.Go']![0]!

  it('`ctx.n += v` and `ctx.n = ctx.n + v` are one IR, the computing one', () => {
    const Inc = event({ payload: z.object({ n: z.number() }) })
    const make = (plus: boolean) =>
      build({
        Inc,
        counter: machine({
          context: z.object({ n: z.number() }),
          initialContext: { n: 0 },
          initial: 'idle',
          states: ({ ctx }) => ({
            idle: {
              on: [
                plus
                  ? on(Inc, {
                      target: 'idle',
                      assign: (e) => {
                        ctx.n += e.n
                      },
                    })
                  : on(Inc, {
                      target: 'idle',
                      assign: (e) => {
                        ctx.n = ctx.n + e.n
                      },
                    }),
              ],
            },
          }),
        }),
      })
    const a = make(true)
    expect(a.ir.features.f!.machine!.states.idle!.on['f.Inc']![0]!.assign).toEqual([
      {
        op: 'set',
        path: ['n'],
        value: {
          fn: '%plus',
          arg: { object: { a: { ref: 'context', path: ['n'] }, b: { ref: 'event', path: ['n'] } } },
        },
      },
    ])
    expect(hashJson(a.ir)).toBe(hashJson(make(false).ir))
  })

  it('a guard %cond becomes and / or, and chains flatten', () => {
    const cond = counter(part((e: { n: number; on: boolean }) => (e.on ? e.n > 1 : e.n < 0)))
    const gt = { op: 'gt', left: { ref: 'event', path: ['n'] }, right: { literal: 1 } }
    const lt = { op: 'lt', left: { ref: 'event', path: ['n'] }, right: { literal: 0 } }
    const on_ = { op: 'fn', fn: '%truthy', arg: { object: { v: { ref: 'event', path: ['on'] } } } }
    expect(first(cond).guard).toEqual({
      op: 'or',
      args: [
        { op: 'and', args: [on_, gt] },
        { op: 'and', args: [{ op: 'not', arg: on_ }, lt] },
      ],
    })
    const chain = counter(part((e: { n: number; on: boolean }) => e.n > 1 && e.n < 5 && e.on === true))
    expect((first(chain).guard as { args: unknown[] }).args).toHaveLength(3)
  })

  it('a child %cond becomes an if node, and a branch may hold several children', () => {
    const viaValue = build({
      board,
      shout: shared.shout,
      Board: ui.view({ machine: board, render: ({ ctx }) => ui.p({}, [label(ctx.notes[0]!)]) }),
    })
    const node = viaValue.ir.features.f!.views.Board!.root
    expect(node.kind === 'el' && node.children[0]!.kind).toBe('if')
    const many = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) => ui.div({}, [ctx.error !== null ? [ui.p({}, ['a']), ui.p({}, ['b'])] : null]),
      }),
    })
    const root = many.ir.features.f!.views.Board!.root
    expect(root.kind === 'el' && root.children[0]).toMatchObject({
      kind: 'if',
      ifTrue: [{}, {}],
      ifFalse: [],
    })
    const loose = build({
      Board: ui.view({ render: () => ui.div({}, [[ui.p({}, ['a'])] as never]) }),
    })
    expect(loose.diagnostics.find((d) => d.code === 'HZ014')?.cause).toMatch(/only as a branch/)
  })

  it('a motion-less ui.if is HZ014 with the ?: spelling', () => {
    const b = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) => ui.div({}, [(ui.if as any)(ctx.error === null, ['ok'], ['error'])]),
      }),
    })
    expect(b.diagnostics.find((d) => d.code === 'HZ014')?.message).toBe('ui.if needs a motion name')
  })
})

describe('lists: includes and removing a scalar (ADR 0043 C)', () => {
  const Toggle = event({ payload: z.object({ id: z.string() }) })
  const picker = machine({
    context: z.object({ ids: z.array(z.string()), last: z.string() }),
    initialContext: { ids: ['a', 'b'], last: '' },
    initial: 'ready',
    states: ({ ctx }) => ({
      ready: {
        on: [
          on(Toggle, {
            target: 'ready',
            guard: (e) => ctx.ids.includes(e.id),
            assign: (e) => {
              ctx.ids = ctx.ids.filter((id) => id !== e.id)
            },
          }),
          on(Toggle, {
            target: 'ready',
            assign: (e) => {
              ctx.ids.push(e.id)
            },
          }),
        ],
      },
    }),
  })
  const Picker = ui.view({
    machine: picker,
    render: ({ ctx }) => ui.button({ type: 'button', 'aria-pressed': ctx.ids.includes('a') }, ['a']),
  })

  it('lowers to %includes and removeWhere(path, null, v), and runs', () => {
    const b = build({ Toggle, picker, Picker })
    expect(codes(b)).toEqual([])
    expect(
      verify(b.ir, { bindings: b.bindings }).diagnostics.filter((d) => !['HZ010', 'HZ016'].includes(d.code)),
    ).toEqual([])
    const t = b.ir.features.f!.machine!.states.ready!.on['f.Toggle']![0]!
    expect(t.guard).toMatchObject({ op: 'fn', fn: '%includes' })
    expect(t.assign).toEqual([
      { op: 'removeWhere', path: ['ids'], key: null, value: { ref: 'event', path: ['id'] } },
    ])
    expect(b.bindings.fns['%includes']).toBeTypeOf('function')
    const m = compileMachine(b.ir.features.f!, b.bindings.fns, routeTable(b.ir))
    const start = init(m).snapshot
    const removed = transition(m, start, { type: 'event', event: 'f.Toggle', payload: { id: 'a' } })
    expect(removed.snapshot.context).toEqual({ ids: ['b'], last: '' })
    const added = transition(m, removed.snapshot, { type: 'event', event: 'f.Toggle', payload: { id: 'a' } })
    expect(added.taken).toBe('ready/on/f.Toggle/1')
    expect(added.snapshot.context).toEqual({ ids: ['b', 'a'], last: '' })
  })

  it('rejects removing whole object items', () => {
    const Drop = event({ payload: Note })
    const b = build({
      Drop,
      dropper: machine({
        context: z.object({ notes: z.array(Note) }),
        initialContext: { notes: [] },
        initial: 'ready',
        states: ({ ctx }) => ({
          ready: {
            on: [
              on(Drop, {
                target: 'ready',
                assign: (e) => {
                  ctx.notes = ctx.notes.filter((n) => n !== e)
                },
              }),
            ],
          },
        }),
      }),
    })
    const d = verify(b.ir, { bindings: b.bindings }).diagnostics.find((x) => x.code === 'HZ014')
    expect(d?.message).toMatch(/not scalars/)
    expect(d?.fix?.snippet).toMatch(/x\.id !== e\.id/)
  })
})

describe('hrefs', () => {
  it('%cond accepts ui.link and ui.alternate values', () => {
    const b = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) =>
          ui.nav({}, [
            ui.a({ href: ctx.error === null ? ui.link(home, null) : ui.link(noteRoute, { id: 'x' }) }, [
              'go',
            ]),
          ]),
      }),
    })
    expect(codes(b)).toEqual([])
    const a = b.ir.features.f!.views.Board!.root
    expect(a.kind === 'el' && a.children[0]!.kind === 'el' && a.children[0]!.attrs.href).toMatchObject({
      fn: '%cond',
      arg: { object: { a: { link: 'home' }, b: { link: 'noteRoute' } } },
    })
    expect(
      verify(b.ir, { bindings: b.bindings }).diagnostics.filter((d) => !['HZ010', 'HZ016'].includes(d.code)),
    ).toEqual([])
  })

  it('HZ032 checks template-string hrefs that start with /', () => {
    const b = build({
      board,
      shout: shared.shout,
      Board: ui.view({
        machine: board,
        render: ({ ctx }) => ui.a({ href: `/notes/${ctx.notes[0]!.id}` }, ['open']),
      }),
    })
    const d = verify(b.ir, { bindings: b.bindings }).diagnostics.find((x) => x.code === 'HZ032')
    expect(d?.message).toBe(
      'Internal link `/notes/…` is built from a template string; use ui.link(noteRoute, { id: … })',
    )
    expect(d?.fix?.snippet).toBe('ui.link(noteRoute, { id: … })')
  })
})
