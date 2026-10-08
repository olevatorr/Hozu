import { feature, machine, project, route, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const m = machine({
  context: z.object({ more: z.boolean(), rows: z.array(z.object({ id: z.string(), label: z.string() })) }),
  initialContext: {
    more: false,
    rows: [
      { id: '1', label: 'one' },
      { id: '2', label: 'two' },
      { id: '3', label: 'three' },
    ],
  },
  initial: 'idle',
  states: () => ({ idle: {} }),
})
const go = ui.button({ type: 'button', class: 'border' }, ['Go'])
const Board = ui.view({
  machine: m,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.button({ type: 'button', keys: ['Mod+k'], on: { click: ui.set(ctx.more, !ctx.more) } }, ['Toggle']),
      ctx.more ? ui.div({}, [go, ui.span({}, ['More'])]) : ui.div({}, [go]),
      ctx.more ? ui.button({ type: 'button' }, ['Less']) : ui.button({ type: 'button' }, ['More']),
      ui.button(
        {
          type: 'button',
          on: {
            click: ui.set(ctx.rows, [
              { id: '0', label: 'zero' },
              { id: '1', label: 'one' },
              { id: '2', label: 'two' },
            ]),
          },
        },
        ['Prepend'],
      ),
      ui.ul({}, [
        ui.each(ctx.rows, 'id', (r) => ui.li({}, [ui.span({ class: 'border' }, ['Priya']), r.label])),
      ]),
      ui.article({ class: 'relative' }, [
        ui.h3({ class: 'after:absolute after:inset-0' }, [ui.a({ href: ui.link(home, null) }, ['Mug'])]),
      ]),
    ]),
})

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  routes: { home },
  pages: [ui.page(home, { views: [Board], head: { render: () => ({ title: 'Flash' }) } })],
  features: [
    feature({
      id: 'flash',
      intent: { summary: 'a flash for hozu browse (ADR 0072 A)' },
      declarations: [{ m, Board }],
    }),
  ],
})
