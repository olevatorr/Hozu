import { feature, fn, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const shout = (s: string) => `${s.toUpperCase()}!`
const loud = fn({
  input: z.object({ text: z.string() }),
  output: z.string(),
  impl: ({ text }) => shout(text),
})
const quiet = fn({
  input: z.object({ text: z.string() }),
  output: z.string(),
  impl: ({ text }) => text.toLowerCase(),
})
const Home = ui.view({ render: () => ui.main({}, ['Home']) })

const appWith = (fns: Record<string, unknown>) =>
  project({
    schema: zodAdapter,
    routes: { home },
    pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
    features: [feature({ id: 'text', intent: { summary: 'fns' }, declarations: { ...fns, Home } as never })],
  })

describe('HZ047: fn bodies must be self-contained', () => {
  it('reports a helper used from outside impl, with its name and the fix', () => {
    const build = buildProject(appWith({ loud, quiet }), { sources: false })
    const found = build.diagnostics.filter((d) => d.code === 'HZ047')
    expect(found).toHaveLength(1)
    expect(found[0]!.message).toBe('fn loud uses `shout`, which is defined outside its impl')
    expect(found[0]!.fix?.summary).toContain('Move `shout` inside impl')
  })

  it('refuses to start a server that would send the broken fn to browsers', () => {
    const app = appWith({ loud })
    expect(() =>
      createHandler({ build: buildProject(app, { sources: false }), resolvers: resolvers(app, () => []) }),
    ).toThrow(/fn loud uses `shout`/)
  })

  it('accepts a self-contained fn', () => {
    const build = buildProject(appWith({ quiet }), { sources: false })
    expect(build.diagnostics.filter((d) => d.code === 'HZ047')).toEqual([])
  })
})
