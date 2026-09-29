import { event, feature, machine, on, op, project, query, route, ui } from '@hozu/core'
import { resolvers } from '@hozu/data'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

const doc = route({ path: '/docs/:slug', params: z.object({ slug: z.string() }), search: null })
const note = route({ path: '/notes', params: null, search: z.object({ pinned: z.boolean().default(false) }) })
const Copy = event({ payload: z.object({ id: z.string() }) })
const Block = z.object({ id: z.string() })
const blocks = query({
  input: z.object({ slug: z.string() }),
  output: z.array(Block),
  errors: {},
  scope: 'public',
  freshness: 'static',
  tags: () => [],
})
const docList = query({
  input: z.object({}),
  output: z.array(z.object({ slug: z.string() })),
  errors: {},
  scope: 'public',
  freshness: 'static',
  tags: () => [],
})
const copier = machine({
  context: z.object({ copied: z.string().nullable() }),
  initialContext: { copied: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [on(Copy, { target: 'idle', assign: (e) => [op.set(ctx.copied, e.id)] })] },
  }),
})
const Doc = ui.view({
  machine: copier,
  route: doc,
  render: ({ ctx, params }) =>
    ui.main({}, [
      ui.h1({}, ['Doc']),
      ui.query(
        blocks,
        { slug: params.slug },
        {
          ready: (list) =>
            ui.div({}, [
              ui.each(list, 'id', (b) =>
                ui.button({ type: 'button', on: { click: ui.send(Copy, { id: b.id }) } }, [
                  b.id,
                  ui.span({ 'data-copied': '' }, [ctx.copied]),
                ]),
              ),
            ]),
          pending: ui.p({}, ['Loading']),
          failed: { Unexpected: () => ui.p({}, ['Unavailable']) },
        },
      ),
    ]),
})
const Note = ui.view({
  machine: copier,
  route: note,
  render: ({ ctx, search }) =>
    ui.main({}, [
      ui.h1({}, ['Note']),
      ui.if(
        op.eq(search.pinned, true),
        [
          ui.button({ type: 'button', on: { click: ui.send(Copy, { id: 'pin' }) } }, [
            'Unpin',
            ui.span({ 'data-copied': '' }, [ctx.copied]),
          ]),
        ],
        [],
      ),
    ]),
})
const docs = feature({
  id: 'docs',
  intent: { summary: 'Docs whose code blocks can be copied', invariants: [] },
  declarations: [{ Copy, blocks, docList, copier, Doc, Note }],
})

export const conditional = project({
  schema: zodAdapter,
  site: { url: 'https://example.test', name: 'Docs', lang: 'en' },
  routes: { doc, note },
  pages: [
    ui.page(doc, {
      views: [Doc],
      head: { render: () => ({ title: 'Doc' }) },
      entries: { query: docList, input: {}, params: (d) => ({ slug: d.slug }) },
    }),
    ui.page(note, { views: [Note], head: { render: () => ({ title: 'Note' }) } }),
  ],
  features: [docs],
})

export const conditionalResolvers = (withCode = true) =>
  resolvers(conditional, (implement) => [
    implement(blocks, ({ slug }) => (withCode && slug === 'code' ? [{ id: 'b1' }, { id: 'b2' }] : [])),
    implement(docList, () => [{ slug: 'code' }, { slug: 'plain' }]),
  ])
