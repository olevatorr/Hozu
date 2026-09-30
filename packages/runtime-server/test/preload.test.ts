import { planRoute } from '@hozu/compiler'
import { buildProject, type Json } from '@hozu/core/ir'
import { createDataRuntime } from '@hozu/data'
import { appOptionsOf, renderToString } from '@hozu/runtime-server'
import { describe, expect, it } from 'vitest'
import createResolversApp from '../../../examples/cart/app.ts'
import cart from '../../../examples/cart/hozu.config.ts'
import { conditional, conditionalResolvers } from './support/conditional.ts'

const createResolvers = () => appOptionsOf(createResolversApp)!.resolvers

const build = buildProject(conditional, { sources: false })
const render = (route: string, params: Record<string, string> | null, search: Record<string, Json> | null) =>
  renderToString({
    build,
    data: createDataRuntime({ build, resolvers: conditionalResolvers() }),
    route,
    params,
    search,
  })
const preload = '<link rel="modulepreload" href="/_hozu/client.js">'

describe('client runtime preload (ADR 0036)', () => {
  it('derives always, conditional or no JS per route', () => {
    expect(planRoute(build.ir, 'doc').plan.js).toBe('conditional')
    expect(planRoute(build.ir, 'note').plan.js).toBe('conditional')
    const cartBuild = buildProject(cart, { sources: false })
    expect(planRoute(cartBuild.ir, 'home').plan.js).toBe('always')
    expect(planRoute(cartBuild.ir, 'orderPlaced').plan.js).toBe(false)
  })

  it('a page that renders no island references no JS at all', async () => {
    for (const [route, params, search] of [
      ['doc', { slug: 'plain' }, null],
      ['note', null, { pinned: false }],
    ] as const) {
      const { html } = await render(route, params, search)
      expect(html).not.toContain('modulepreload')
      expect(html).not.toContain('hozu-payload')
      expect(html).not.toContain('/_hozu/client.js')
    }
  })

  it('a page that renders one preloads right before its first island, in streamed and generated output', async () => {
    for (const [route, params, search] of [
      ['doc', { slug: 'code' }, null],
      ['note', null, { pinned: true }],
    ] as const) {
      const { html } = await render(route, params, search)
      const head = html.slice(0, html.indexOf('</head>'))
      expect(head).not.toContain('modulepreload')
      expect(html.split(preload)).toHaveLength(2)
      expect(html.indexOf(`${preload}<!--i-->`)).toBe(html.indexOf('<!--i-->') - preload.length)
      expect(html).toContain('<script type="module" src="/_hozu/client.js"></script>')
    }
  })

  it('pages with a certain island keep the preload in <head>', async () => {
    const cartBuild = buildProject(cart, { sources: false })
    const { html } = await renderToString({
      build: cartBuild,
      data: createDataRuntime({ build: cartBuild, resolvers: createResolvers() }),
      route: 'home',
      session: { userId: 'ada' },
    })
    expect(html.slice(0, html.indexOf('</head>'))).toContain(preload)
    expect(html.split(preload)).toHaveLength(2)
  })
})
