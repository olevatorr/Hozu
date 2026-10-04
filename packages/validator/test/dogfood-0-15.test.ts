import { feature, project, query, route, ui } from '@hozu/core'
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
    ui.query(listRooms, {}, { ready: (rooms) => ui.p({}, [rooms.length === 0 ? 'none' : 'some']) }),
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
})
