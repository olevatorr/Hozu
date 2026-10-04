import { event, feature, machine, on, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { createHandler, renderToString } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const teams = query({
  input: z.object({}),
  output: z.array(z.object({ id: z.string() })),
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})
const Share = event({ payload: z.object({ team: z.string() }) })
const m = machine({
  context: z.object({ team: z.string() }),
  initialContext: { team: '' },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Share, {
          target: 'idle',
          assign: (e) => {
            ctx.team = e.team
          },
        }),
      ],
    },
  }),
})
const home = route({ path: '/notes', params: null, search: null })
const Board = ui.view({
  machine: m,
  render: () =>
    ui.form({ on: { submit: ui.send(Share, { team: ui.dom.form('team') }) } }, [
      ui.select({ name: 'team' }, [
        ui.query(
          teams,
          {},
          {
            ready: (list) => ui.each(list, 'id', (t) => ui.option({ value: t.id }, [t.id])),
            failed: { Unexpected: () => null },
          },
        ),
      ]),
      ui.button({ type: 'submit' }, ['Share']),
    ]),
})
const app = project({
  schema: zodAdapter,
  routes: { home },
  pages: [ui.page(home, { views: [Board], head: { render: () => ({ title: 'Notes' }) } })],
  features: [feature({ id: 'n', intent: { summary: 'share' }, declarations: [{ teams, Share, m, Board }] })],
})

describe('0.15 dogfood (ADR 0057 C)', () => {
  it('a form holding a ui.query still posts natively (it is rendered by the streaming path)', async () => {
    const build = buildProject(app, { sources: false })
    const data = createDataRuntime({
      build,
      resolvers: resolvers(app, (implement) => [implement(teams, () => [{ id: 'design' }])]),
    })
    const { html } = await renderToString({ build, data, route: 'home' })
    expect(html).toContain('<form method="post" action="/notes?__hozu=n.Board">')
    expect(html).toContain('<option value="design">design</option>')
  })

  it('and the native post of that form is handled (the page re-renders with the result)', async () => {
    const build = buildProject(app, { sources: false })
    const handler = createHandler({
      build,
      resolvers: resolvers(app, (implement) => [implement(teams, () => [{ id: 'design' }])]),
    })
    const res = await handler.fetch(
      new Request('http://localhost/notes?__hozu=n.Board', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
        body: 'team=design',
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<form method="post" action="/notes?__hozu=n.Board">')
  })
})

describe('a refused native post redirects like the page (0.15 dogfood)', () => {
  it('signed out, a forged post to a page whose head maps Forbidden to login answers 303 /login', async () => {
    const { testApp } = await import('@hozu/testing')
    const notes = (await import('../../../examples/notes/app.ts')).default
    const page = await testApp(notes, { env: { SESSION_SECRET: 'x'.repeat(32) } }).post(
      '/?__hozu=notes.NotesBoard%2F7%2Fready%2F2%2FifFalse%2F0%2F0%2Fitem%2F4',
      { id: 'n1' },
    )
    expect([page.status, page.headers.get('location')]).toEqual([303, '/login'])
  })
})
