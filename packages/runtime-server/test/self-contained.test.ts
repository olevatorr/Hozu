import { event, feature, fn, machine, on, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler, fnModules } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const MARK = '!'
const shout = (s: string) => `${s.toUpperCase()}${MARK}`
const loud = fn({
  input: z.object({ text: z.string() }),
  output: z.string(),
  impl: ({ text }) => shout(text),
})
let calls = 0
const counted = fn({
  input: z.object({ text: z.string() }),
  output: z.string(),
  impl: ({ text }) => `${text}${calls}`,
})
const Home = ui.view({ render: () => ui.main({}, ['Home']) })
const Type = event({ payload: z.object({ text: z.string() }) })
const typing = machine({
  context: z.object({ text: z.string() }),
  initialContext: { text: '' },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Type, {
          assign: (e) => {
            ctx.text = e.text
          },
        }),
      ],
    },
  }),
})
const Echo = ui.view({
  machine: typing,
  render: ({ ctx }) =>
    ui.main({}, [
      ui.input({ 'aria-label': 'Text', on: { input: ui.send(Type, { text: ui.dom.value }) } }),
      ui.p({}, [loud({ text: ctx.text })]),
    ]),
})

const appWith = (fns: Record<string, unknown>) =>
  project({
    schema: zodAdapter,
    routes: { home },
    pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
    features: [feature({ id: 'text', intent: { summary: 'fns' }, declarations: [{ ...fns, Home }] })],
  })

describe('fn bodies and module helpers (ADR 0040 A, ADR 0041 B)', () => {
  it('ships a self-contained helper, and the constants it uses, with the fn', async () => {
    calls++
    const build = buildProject(appWith({ loud, Type, typing, Echo }), { sources: false })
    expect(build.diagnostics.filter((d) => d.code === 'HZ047')).toEqual([])
    const source = fnModules(build).text!.source
    expect(source).toContain('const MARK = "!";')
    const { fns } = await import(`data:text/javascript,${encodeURIComponent(source)}`)
    expect(fns['text.loud']({ text: 'park' })).toBe('PARK!')
  })

  it('ships no fn that only the server calls (ADR 0050 C)', () => {
    expect(fnModules(buildProject(appWith({ loud }), { sources: false })).text).toBeUndefined()
  })

  it('reports mutable module state as HZ047, and the server refuses to start', () => {
    const app = appWith({ counted })
    const found = buildProject(app, { sources: false }).diagnostics.filter((d) => d.code === 'HZ047')
    expect(found.map((d) => d.message)).toEqual([
      'fn counted uses `calls`, which is defined outside its impl',
    ])
    expect(() =>
      createHandler({ build: buildProject(app, { sources: false }), resolvers: resolvers(app, () => []) }),
    ).toThrow(/fn counted uses `calls`/)
  })
})
