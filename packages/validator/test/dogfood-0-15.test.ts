import { endpoint, event, feature, machine, on, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const listRooms = query({
  input: z.object({}),
  output: z.array(z.string()),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
const home = route({ path: '/', params: null, search: null })
const Home = ui.view({
  render: () =>
    ui.query(
      listRooms,
      {},
      {
        ready: (rooms) => ui.p({}, [rooms.length === 0 ? 'none' : 'some']),
        failed: { Unexpected: () => null },
      },
    ),
})

const make = (exports: unknown) =>
  project({
    schema: zodAdapter,
    routes: { home },
    pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Rooms' }) } })],
    features: [
      feature({
        id: 'bookings',
        intent: { summary: 'rooms' },
        declarations: [{ listRooms }],
        exports: exports as never,
      }),
      feature({ id: 'site', intent: { summary: 'home' }, declarations: [{ Home }] }),
    ],
  })

describe('0.15 dogfood (ADR 0057 C)', () => {
  it('exports in the old record form is HZ014 with the list form, not a crash', () => {
    const build = buildProject(make({ queries: [listRooms] }), { sources: false })
    const found = build.diagnostics.find((d) => d.message === 'exports is a list of declarations')
    expect(found?.code).toBe('HZ014')
    expect(found?.fix?.snippet).toBe('exports: [model.listRooms, model.roomsTag]')
  })

  it('HZ006 shows both edits in source form, each with the feature it belongs to', () => {
    const build = buildProject(make(undefined), { sources: false })
    const found = validate(build.ir).find((d) => d.code === 'HZ006')
    expect(found?.fix?.snippet).toBe(
      'imports: [bookings],   // in feature "site"\nexports: [listRooms],   // in feature "bookings", next to its declarations',
    )
  })

  it('a head field Hozu does not know is HZ014, not silently dropped', () => {
    const app = project({
      schema: zodAdapter,
      routes: { home },
      pages: [
        ui.page(home, {
          views: [Home],
          head: { render: () => ({ title: 'Rooms', twitter: 'summary_large_image' }) as never },
        }),
      ],
      features: [feature({ id: 'site', intent: { summary: 'home' }, declarations: [{ Home, listRooms }] })],
    })
    const found = buildProject(app, { sources: false }).diagnostics.find((d) => d.code === 'HZ014')
    expect(found?.message).toBe('head.render returns "twitter", which is not a head field')
  })

  it('an endpoint at /sitemap.xml is HZ046: the sitemap is derived', () => {
    const sitemap = endpoint({ method: 'GET', path: '/sitemap.xml', input: z.object({}), output: 'response' })
    const app = project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Rooms' }) } })],
      features: [
        feature({ id: 'site', intent: { summary: 'home' }, declarations: [{ Home, listRooms, sitemap }] }),
      ],
    })
    const found = validate(buildProject(app, { sources: false }).ir).find((d) => d.code === 'HZ046')
    expect(found?.message).toBe('Endpoint path "/sitemap.xml" of site.sitemap replaces a file Hozu derives')
  })

  it('two controls of one name in exclusive branches of a query are one value, not HZ054', () => {
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
    const Board = ui.view({
      machine: m,
      render: () =>
        ui.form({ on: { submit: ui.send(Share, { team: ui.dom.form('team') }) } }, [
          ui.query(
            listRooms,
            {},
            {
              ready: (rooms) =>
                ui.select({ name: 'team' }, [ui.each(rooms, null, (r) => ui.option({ value: r }, [r]))]),
              failed: { Unexpected: () => ui.input({ type: 'hidden', name: 'team', value: '' }) },
            },
          ),
          ui.button({ type: 'submit' }, ['Share']),
        ]),
    })
    const app = project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [Board], head: { render: () => ({ title: 'Share' }) } })],
      features: [
        feature({ id: 'n', intent: { summary: 'share' }, declarations: [{ Board, Share, m, listRooms }] }),
      ],
    })
    expect(validate(buildProject(app, { sources: false }).ir).map((d) => d.code)).not.toContain('HZ054')
  })
})
