import { feature, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { expect, it } from 'vitest'
import { z } from 'zod'

const list = route({
  path: '/',
  params: null,
  search: z.object({ notice: z.enum(['saved']).nullable().default(null) }),
})
const List = ui.view({ render: () => ui.main({}, ['Orders']) })
const site = { url: 'https://shop.example', name: 'Shop', lang: 'en' }
const app = (page: ReturnType<typeof ui.page>) =>
  project({
    schema: zodAdapter,
    site,
    routes: { list },
    pages: [page],
    features: [feature({ id: 'o', intent: { summary: 'orders' }, declarations: [{ List }] })],
  })

it('head.render may compute noindex: a notice URL is not indexed, the list is (ADR 0079 A3a)', async () => {
  const project = app(
    ui.page(list, {
      views: [List],
      head: { render: (_d, _p, _l, search) => ({ title: 'Orders', noindex: search.notice !== null }) },
    }),
  )
  const build = buildProject(project, { sources: false })
  expect(build.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  const handler = createHandler({ build, resolvers: resolvers(project, () => []) })
  const page = async (path: string) => (await handler.fetch(new Request(`http://x${path}`))).text()
  expect(await page('/?notice=saved')).toContain('<meta name="robots" content="noindex">')
  expect(await page('/')).not.toContain('name="robots"')
  expect(await page('/robots.txt')).not.toContain('Disallow: /\n')
})

it('a literal noindex still leaves the page out of robots.txt, and a computed type is HZ014', async () => {
  const hidden = app(
    ui.page(list, { views: [List], head: { render: () => ({ title: 'Orders', noindex: true }) } }),
  )
  const build = buildProject(hidden, { sources: false })
  const robots = await (
    await createHandler({ build, resolvers: resolvers(hidden, () => []) }).fetch(
      new Request('http://x/robots.txt'),
    )
  ).text()
  expect(robots).toContain('Disallow: /')
  const typed = buildProject(
    app(
      ui.page(list, {
        views: [List],
        head: {
          render: (_d, _p, _l, search) => ({
            title: 'Orders',
            type: search.notice === null ? 'article' : 'website',
          }),
        },
      }),
    ),
    { sources: false },
  )
  expect(typed.diagnostics.find((d) => d.code === 'HZ014')?.message).toBe(
    'head.render returns a computed type',
  )
})

it('a literal noindex that is not a boolean is HZ014, not silently ignored (ADR 0079 review)', () => {
  const build = buildProject(
    app(
      ui.page(list, {
        views: [List],
        head: { render: () => ({ title: 'Orders', noindex: 'yes' as never }) },
      }),
    ),
    { sources: false },
  )
  expect(build.diagnostics.find((d) => d.code === 'HZ014')?.message).toBe(
    'head.render returns a noindex that is not a boolean',
  )
})
