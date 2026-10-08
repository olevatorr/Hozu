import { contract, event, feature, machine, on, project, route, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

const Bump = event({ payload: z.object({}) })
const Switch = event({ payload: z.object({}) })
const m = machine({
  context: z.object({ n: z.number() }),
  initialContext: { n: 0 },
  initial: 'a',
  on: ({ ctx }) => [
    on(Bump, {
      assign: () => {
        ctx.n += 1
      },
    }),
  ],
  states: () => ({
    a: { on: [on(Switch, { target: 'b' })] },
    b: { on: [on(Switch, { target: 'a' })] },
  }),
})
const bumps = contract(m, {
  given: { state: 'a' },
  when: [{ send: Bump, payload: {} }],
  expect: { state: 'a', changes: { n: 1 } },
})
const Board = ui.view({
  machine: m,
  render: ({ ctx }) => ui.button({ type: 'button', on: { click: ui.send(Bump, {}) } }, [`${ctx.n}`]),
})
const home = route({ path: '/', params: null, search: null })

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  routes: { home },
  pages: [ui.page(home, { views: [Board], head: { render: () => ({ title: 'Shared on' }) } })],
  features: [
    feature({
      id: 'shared',
      intent: { summary: 'one contract covers a shared on in every state (hozu check coverage)' },
      declarations: [{ Bump, Switch, m, bumps, Board }],
    }),
  ],
})
