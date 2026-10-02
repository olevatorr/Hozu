// @vitest-environment happy-dom
import { endpoint, event, feature, invoke, machine, mutation, on, project, route, tag, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { type EffectResponse, hydrate } from '@hozu/runtime-client'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const notesTag = tag({ param: null })
const Bulk = event({ payload: z.object({ ids: z.array(z.string()), action: z.enum(['delete', 'archive']) }) })
const Named = event({ payload: z.object({ title: z.string() }) })
const removeMany = mutation({
  input: z.object({ ids: z.array(z.string()).min(1, 'Select at least one note') }),
  output: z.object({ count: z.number() }),
  invalidates: () => [notesTag()],
  runs: 'server',
})
const importTags = endpoint({
  method: 'POST',
  path: '/api/tags',
  input: z.object({ tags: z.array(z.string()), label: z.string(), none: z.array(z.string()) }),
  output: z.object({ got: z.string() }),
})

const board = machine({
  context: z.object({
    picked: z.array(z.string()),
    action: z.string(),
    removed: z.number(),
    fields: z.object({ ids: z.string().nullable() }),
  }),
  initialContext: { picked: [], action: '', removed: 0, fields: { ids: null } },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Bulk, {
          target: 'removing',
          assign: (e) => {
            ctx.picked = e.ids
            ctx.action = e.action
          },
        }),
        on(Named, { target: 'idle' }),
      ],
    },
    removing: {
      ignore: [Bulk, Named],
      invoke: invoke(removeMany, {
        input: { ids: ctx.picked },
        done: {
          target: 'idle',
          assign: (r) => {
            ctx.removed = r.count
          },
        },
        failed: {
          Invalid: {
            target: 'idle',
            assign: (e) => {
              ctx.fields = e.fields
            },
          },
          Unexpected: 'idle',
        },
      }),
    },
  }),
})
const bulk = ui.formRef()
const Board = ui.view({
  machine: board,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.form(
        {
          ref: bulk,
          on: { submit: ui.send(Bulk, { ids: ui.dom.formAll('ids'), action: ui.dom.form('action') }) },
        },
        [
          ui.button({ type: 'submit', name: 'action', value: 'delete' }, ['Delete selected']),
          ui.button({ type: 'submit', name: 'action', value: 'archive' }, ['Archive selected']),
        ],
      ),
      ui.ul({}, [
        ui.li({}, [ui.input({ type: 'checkbox', form: bulk, name: 'ids', value: 'n1', 'aria-label': 'n1' })]),
        ui.li({}, [ui.input({ type: 'checkbox', form: bulk, name: 'ids', value: 'n2', 'aria-label': 'n2' })]),
      ]),
      ui.p({ class: 'picked' }, [ctx.action, ':', ctx.removed]),
      ui.p({ role: 'alert' }, [ctx.fields.ids]),
    ]),
})
const home = route({ path: '/', params: null, search: null })
const app = project({
  schema: zodAdapter,
  routes: { home },
  pages: [ui.page(home, { views: [Board], head: { render: () => ({ title: 'Bulk' }) } })],
  features: [
    feature({
      id: 'b',
      intent: { summary: 'ADR 0043 C forms' },
      declarations: [{ notesTag, Bulk, Named, removeMany, importTags, board, bulk, Board }],
    }),
  ],
})
const build = buildProject(app, { sources: false })

const removed: string[][] = []
const handler = () =>
  createHandler({
    build,
    resolvers: resolvers(app, (implement) => [
      implement(removeMany, ({ ids }) => {
        removed.push(ids)
        return { count: ids.length }
      }),
      implement(importTags, (input) => ({ got: JSON.stringify(input) })),
    ]),
  })

const post = (h: ReturnType<typeof handler>, action: string, body: string) =>
  h.fetch(
    new Request(`https://b.test${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }),
  )

const actionOf = async (h: ReturnType<typeof handler>) => {
  const html = await (await h.fetch(new Request('https://b.test/'))).text()
  return { html, action: /<form[^>]* action="([^"]+)"/.exec(html)![1]!.replace(/&amp;/g, '&') }
}

const alert = (html: string) => /<p role="alert">([^<]*)<\/p>/.exec(html.replace(/<!--[^>]*-->/g, ''))?.[1]

describe('ADR 0043 C: forms on the server', () => {
  it('renders the formRef as the form id and the controls form attribute', async () => {
    const { html } = await actionOf(handler())
    expect(html).toContain('<form id="b.Board/0" method="post"')
    expect(html).toContain('form="b.Board/0" name="ids" value="n1"')
  })

  it('a native post reads every value of a name and the pressed button', async () => {
    const h = handler()
    const { action } = await actionOf(h)
    removed.length = 0
    const res = await post(h, action, 'ids=n1&ids=n2&action=archive')
    expect(res.status).toBe(200)
    expect(removed).toEqual([['n1', 'n2']])
    expect((await res.text()).replace(/<!--[^>]*-->/g, '')).toContain('<p class="picked">archive:2</p>')
  })

  it('an invalid native post re-renders with 400 and the Invalid branch, as the JS submit does', async () => {
    const h = handler()
    const { html, action } = await actionOf(h)
    removed.length = 0
    const res = await post(h, action, 'action=delete')
    const native = await res.text()
    expect([res.status, alert(native)]).toEqual([400, 'Select at least one note'])

    document.open()
    document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
    document.close()
    await hydrate(document, {
      loadFns: async () => build.bindings.fns as never,
      transport: async (effect, input, keys) =>
        (await (
          await h.fetch(
            new Request('https://b.test/_hozu/effect', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ effect, input, keys }),
            }),
          )
        ).json()) as EffectResponse,
    })
    const form = document.querySelector('form')!
    const submitter = document.querySelector('button')!
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter }))
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector('p[role="alert"]')?.textContent).toBe(alert(native))
    expect(removed).toEqual([])
  })

  it('a payload that fails its event schema without reaching an invalid mutation input still answers 400', async () => {
    const h = handler()
    const { action } = await actionOf(h)
    removed.length = 0
    const res = await post(h, action, 'ids=n1&action=explode')
    expect(res.status).toBe(400)
    expect(removed).toEqual([])
  })

  it('an endpoint form body is multi-valued exactly where the input schema is an array', async () => {
    const res = await post(handler(), '/api/tags', 'tags=a&tags=b&label=x&label=y')
    expect(await res.json()).toEqual({ got: JSON.stringify({ tags: ['a', 'b'], label: 'x', none: [] }) })
  })
})
