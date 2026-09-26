import { contract, event, feature, machine, on, op, project, query, route, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

const Draft = event({ payload: z.object({ text: z.string() }) })
const Resize = event({ payload: z.object({ width: z.number() }) })
const Tag = event({ payload: z.object({ tag: z.string() }) })

export const note = query({
  input: z.object({}),
  output: z.object({ html: z.string() }),
  scope: 'public',
  freshness: 'static',
  tags: () => [],
})

const home = route({ path: '/', params: null, search: null })
const item = route({ path: '/items/:id', params: z.object({ id: z.string() }), search: null })

const extras = machine({
  context: z.object({ draft: z.string(), tags: z.array(z.string()), width: z.number() }),
  initialContext: { draft: '', tags: ['alpha', 'beta'], width: 0 },
  initial: 'ready',
  states: ({ ctx }) => ({
    ready: {
      on: [
        on(Draft, { target: 'ready', assign: (d) => [op.set(ctx.draft, d.text)] }),
        on(Resize, { target: 'ready', assign: (r) => [op.set(ctx.width, r.width)] }),
        on(Tag, { target: 'ready', assign: (t) => [op.append(ctx.tags, t.tag)] }),
      ],
    },
  }),
})

const Page = ui.view({
  machine: extras,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.input({ name: 'draft', value: ctx.draft, on: { input: ui.send(Draft, { text: ui.dom.value }) } }),
      ui.if(
        op.eq(ctx.draft, ''),
        [ui.p({ class: 'empty' }, ['Nothing yet'])],
        [ui.p({ class: 'draft' }, ['Draft: ', ctx.draft])],
        'fade',
      ),
      ui.ul({}, [ui.each(ctx.tags, null, (t) => ui.li({}, [t]))]),
      ui.button({ type: 'button', on: { click: ui.send(Tag, { tag: 'gamma' }) } }, ['Tag']),
      ui.a({ href: ui.link(item, { id: 'a b' }) }, ['Item']),
      ui.window({ on: { resize: ui.send(Resize, { width: ui.dom.innerWidth }) } }),
      ui.p({ class: 'width' }, ['Width: ', ctx.width]),
      ui.query(
        note,
        {},
        {
          ready: (n) => ui.div({ class: 'note' }, [ui.html(n.html)]),
          pending: null,
          failed: { Unexpected: () => ui.p({}, ['No note']) },
        },
      ),
    ]),
})

const head = {
  render: () => ({
    title: 'Extras',
    description: 'Fixture',
  }),
}

const site = project({
  schema: zodAdapter,
  routes: { home, item },
  pages: [ui.page(home, { views: [Page], head }), ui.page(item, { views: [], head })],
  features: [
    feature({
      id: 'extras',
      intent: { summary: 'Capability fixture' },
      declarations: {
        Draft,
        Resize,
        Tag,
        note,
        Page,
        covers: contract(extras, {
          given: { state: 'ready', context: { draft: '', tags: [], width: 0 } },
          when: [
            { send: Draft, payload: { text: 'x' } },
            { send: Resize, payload: { width: 800 } },
            { send: Tag, payload: { tag: 'a' } },
          ],
          expect: { state: 'ready', changes: { draft: 'x', tags: ['a'], width: 800 } },
        }),
        extras,
      },
    }),
  ],
})

export default site
