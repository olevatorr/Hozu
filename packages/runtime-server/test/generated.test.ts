import type { ProjectDecl } from '@tenon/core'
import { buildProject, type Json } from '@tenon/core/ir'
import { createDataRuntime, resolvers } from '@tenon/data'
import { pageEntries, renderToString } from '@tenon/runtime-server'
import { describe, expect, it } from 'vitest'
import { escapeHtml } from '../src/escape.ts'
import type { Variants } from '../src/images.ts'

const examples = ['blog', 'bookmarks', 'cart', 'feed', 'showcase', 'trial-0006', 'trial-0007', 'trial-tasks']

const variantsOf = (assets: Record<string, unknown>): Variants =>
  Object.fromEntries(Object.keys(assets).map((href) => [href, [{ width: 320, href: `${href}?w=320` }]]))

describe('generated render functions', () => {
  for (const name of examples)
    it(`renders every page of ${name}, with and without image variants`, async () => {
      const project = (await import(`../../../examples/${name}/tenon.config.ts`)).default as ProjectDecl
      const { createResolvers } = await import(`../../../examples/${name}/server.ts`)
      const build = buildProject(project, { sources: false })
      const entries = await pageEntries(build, createDataRuntime({ build, resolvers: createResolvers() }))
      expect(entries.length).toBeGreaterThan(0)
      for (const images of [null, variantsOf(build.bindings.assets)])
        for (const e of entries) {
          const data = createDataRuntime({ build, resolvers: createResolvers() })
          const { html, status } = await renderToString({
            build,
            data,
            route: e.route,
            params: e.params as Json,
            session: { userId: 'ada', user: 'ada', name: 'Ada' },
            locale: e.locale,
            images,
          })
          expect(status, `${name} ${e.path}`).toBeLessThan(500)
          expect(html.endsWith('</html>'), `${name} ${e.path}`).toBe(true)
        }
    })
})

describe('generated source', () => {
  it('embeds IR strings as data, never as code', async () => {
    const { event, feature, machine, on, op, project, route, ui } = await import('@tenon/core')
    const { zodAdapter } = await import('@tenon/schema-zod')
    const { z } = await import('zod')
    const hostile = `"'\`\${globalThis.pwned = 1}</script><!--    \\ */`
    const Ping = event({ payload: z.object({ v: z.string() }) })
    const m = machine({
      context: z.object({ n: z.number() }),
      initialContext: { n: 0 },
      initial: 'idle',
      states: ({ ctx }) => ({
        idle: { on: [on(Ping, { target: 'idle', assign: () => [op.inc(ctx.n, 1)] })] },
      }),
    })
    const home = route({ path: '/', params: null, search: null })
    const View = ui.view({
      machine: m,
      render: ({ ctx }) =>
        ui.main({ 'data-x': hostile, title: hostile }, [
          hostile,
          ui.if(op.eq(ctx.n, 0), [ui.p({ 'data-y': hostile }, [hostile])], []),
          ui.button({ type: 'button', on: { click: ui.send(Ping, { v: hostile }) } }, [hostile]),
        ]),
    })
    const decl = project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [View], head: { render: () => ({ title: 'x' }) } })],
      features: [feature({ id: 'f', intent: { summary: 'x' }, declarations: { Ping, m, View } })],
    })
    const build = buildProject(decl, { sources: false })
    const data = createDataRuntime({ build, resolvers: resolvers(decl, () => []) })
    const { html } = await renderToString({ build, data, route: 'home' })
    expect((globalThis as { pwned?: number }).pwned).toBeUndefined()
    const escaped = escapeHtml(hostile)
    expect(html).toContain(`<main data-x="${escaped}" title="${escaped}">${escaped}`)
    expect(html).toContain(`<p data-y="${escaped}">${escaped}</p>`)
    expect(html).toContain(`<button type="button">${escaped}</button>`)
  })
})
