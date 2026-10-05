import { feature, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Post = z.object({ title: z.string(), excerpt: z.string() })
const getPost = query({
  input: z.object({ slug: z.string() }),
  output: Post,
  errors: { NotFound: z.object({}), Gone: z.object({}) },
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})
const postPage = route({ path: '/posts/:slug', params: z.object({ slug: z.string() }), search: null })
const PostView = ui.view({
  route: postPage,
  render: ({ params }) =>
    ui.main({}, [
      ui.query(
        getPost,
        { slug: params.slug },
        {
          ready: (p) => ui.h1({}, [p.title]),
          failed: {
            NotFound: () => ui.p({ role: 'alert' }, ['No such post']),
            Gone: () => ui.p({ role: 'alert' }, ['Removed']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']),
          },
        },
      ),
    ]),
})
const app = project({
  schema: zodAdapter,
  site: { url: 'https://blog.test', name: 'WorldBook', lang: 'en' },
  routes: { postPage },
  pages: [
    ui.page(postPage, {
      views: [PostView],
      head: {
        query: getPost,
        input: (params) => ({ slug: params.slug }),
        render: (p) => ({ title: `${p.title} · WorldBook`, description: p.excerpt }),
        failed: { NotFound: 404, Gone: 410 },
      },
    }),
  ],
  features: [
    feature({ id: 'posts', intent: { summary: 'ADR 0060 A' }, declarations: [{ getPost, PostView }] }),
  ],
})

const handler = createHandler({
  build: buildProject(app, { sources: false }),
  csp: false,
  resolvers: resolvers(app, (implement) => [
    implement(getPost, ({ slug }, { fail }) =>
      slug === 'hello'
        ? { title: 'Hello', excerpt: 'First post' }
        : slug === 'old'
          ? fail('Gone', {})
          : fail('NotFound', {}),
    ),
  ]),
})
const page = async (path: string) => {
  const r = await handler.fetch(new Request(`https://blog.test${path}`))
  return { status: r.status, html: await r.text() }
}

describe('a failed head query (ADR 0060 A)', () => {
  it('titles the page with the site name and leaves out the fields it could not compute', async () => {
    const ok = await page('/posts/hello')
    expect(ok.html).toContain('<title>Hello · WorldBook</title>')
    expect(ok.html).toContain('content="First post"')
    for (const [path, status] of [
      ['/posts/nope', 404],
      ['/posts/old', 410],
    ] as const) {
      const failed = await page(path)
      expect(failed.status).toBe(status)
      expect(failed.html).toContain('<title>WorldBook</title>')
      expect(failed.html).not.toContain('null')
      expect(failed.html).not.toContain('name="description"')
    }
  })
})
