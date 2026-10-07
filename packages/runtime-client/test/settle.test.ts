// @vitest-environment happy-dom
import { event, feature, machine, on, project, query, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { compileMachine } from '@hozu/machine'
import { mount, type Payload, payloadKey, type Result } from '@hozu/runtime-client'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const Add = event({ payload: z.object({ symbol: z.string() }) })
const quotes = query({
  input: z.object({ symbols: z.array(z.string()) }),
  output: z.array(z.object({ symbol: z.string(), price: z.number() })),
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})
const m = machine({
  context: z.object({ symbols: z.array(z.string()) }),
  initialContext: { symbols: ['A'] },
  initial: 'idle',
  on: ({ ctx }) => [
    on(Add, {
      assign: (e) => {
        ctx.symbols.push(e.symbol)
      },
    }),
  ],
  states: () => ({ idle: {} }),
})
const Board = ui.view({
  machine: m,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.button({ type: 'button', on: { click: ui.send(Add, { symbol: 'B' }) } }, ['Add']),
      ui.section({}, [
        ui.query(
          quotes,
          { symbols: ctx.symbols },
          {
            pending: ui.p({}, ['Loading']),
            ready: (rows) => ui.ul({}, [ui.each(rows, 'symbol', (q) => ui.li({}, [q.symbol, ' ', q.price]))]),
            failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
          },
        ),
      ]),
    ]),
})
const b = buildProject(
  project({
    schema: zodAdapter,
    routes: {},
    pages: [],
    features: [
      feature({ id: 'w', intent: { summary: 'settle' }, declarations: [{ Add, quotes, m, Board }] }),
    ],
  }),
)
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('a query region settles instead of being replaced (ADR 0067 C1)', () => {
  it('keeps the rows, marks the region busy, then inserts only the new row', async () => {
    const payload: Payload = new Map<string, Result>([
      [payloadKey('w.quotes', { symbols: ['A'] }), { ok: true, value: [{ symbol: 'A', price: 1 }] }],
    ])
    let answer: (r: Result) => void = () => {}
    const root = document.createElement('div')
    mount(root, {
      view: b.ir.features.w!.views.Board!,
      machine: compileMachine(b.ir.features.w!, b.bindings.fns),
      payload,
      fns: b.bindings.fns,
      onQuery: () => new Promise<Result>((r) => (answer = r)),
    })
    const first = root.querySelector('li')!
    expect(first.textContent).toBe('A 1')
    root.querySelector('button')!.click()
    await tick()
    expect(root.querySelector('li')).toBe(first)
    expect(root.textContent).not.toContain('Loading')
    expect(root.querySelector('section')!.getAttribute('aria-busy')).toBe('')
    answer({
      ok: true,
      value: [
        { symbol: 'A', price: 2 },
        { symbol: 'B', price: 3 },
      ],
    })
    await tick()
    const rows = [...root.querySelectorAll('li')]
    expect(rows.map((r) => r.textContent)).toEqual(['A 2', 'B 3'])
    expect(rows[0]).toBe(first)
    expect(root.querySelector('section')!.hasAttribute('aria-busy')).toBe(false)
  })

  it('shows pending only while there is no data yet', () => {
    const root = document.createElement('div')
    mount(root, {
      view: b.ir.features.w!.views.Board!,
      machine: compileMachine(b.ir.features.w!, b.bindings.fns),
      payload: new Map(),
      fns: b.bindings.fns,
      onQuery: () => new Promise<Result>(() => {}),
    })
    expect(root.textContent).toContain('Loading')
  })

  it('fades in what an update adds, nothing on the first render, and nothing for reduced motion (ADR 0067 C3)', async () => {
    const calls: string[] = []
    const animate = vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element) {
      calls.push(this.textContent ?? '')
      return {} as Animation
    })
    const payload: Payload = new Map<string, Result>([
      [payloadKey('w.quotes', { symbols: ['A'] }), { ok: true, value: [{ symbol: 'A', price: 1 }] }],
      [
        payloadKey('w.quotes', { symbols: ['A', 'B'] }),
        {
          ok: true,
          value: [
            { symbol: 'A', price: 1 },
            { symbol: 'B', price: 2 },
          ],
        },
      ],
    ])
    const start = (reduce: boolean) => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reduce } as MediaQueryList)
      const root = document.createElement('div')
      mount(root, {
        view: b.ir.features.w!.views.Board!,
        machine: compileMachine(b.ir.features.w!, b.bindings.fns),
        payload,
        fns: b.bindings.fns,
      })
      return root
    }
    const root = start(false)
    expect(calls).toEqual([])
    root.querySelector('button')!.click()
    await tick()
    expect(calls).toEqual(['B 2'])
    calls.length = 0
    start(true).querySelector('button')!.click()
    await tick()
    expect(calls).toEqual([])
    animate.mockRestore()
    vi.restoreAllMocks()
  })
})
