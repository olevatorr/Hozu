import { buildProject } from '@tenonkit/core/ir'
import { ogImage, ogSvg } from '@tenonkit/image'
import { testApp } from '@tenonkit/testing'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { createResolvers } from '../../../examples/blog/server.ts'
import project from '../../../examples/blog/tenon.config.ts'

const build = buildProject(project, { sources: false })
const session = () => ({ userId: 'a' })

describe('Open Graph images (ADR 0021)', () => {
  it('puts an absolute og:image URL in the head and serves a 1200×630 PNG', async () => {
    const app = testApp({ build, resolvers: createResolvers(), session, og: ogImage })
    const page = await app.get('/en/posts/hello-tenon')
    const image = /<meta property="og:image" content="([^"]+)">/.exec(page.html)![1]!.replace(/&amp;/g, '&')
    expect(image).toBe(
      'https://blog.tenon.dev/_tenon/og.png?title=Hello%2C+Tenon&subtitle=Why+an+AI-first+framework+makes+invalid+programs+hard+to+write.',
    )
    const png = await app.get(image.slice('https://blog.tenon.dev'.length))
    expect([png.status, png.headers.get('content-type')]).toEqual([200, 'image/png'])
    const meta = await sharp(
      Buffer.from(await ogImage({ title: 'Hello', subtitle: null, siteName: 'Blog', themeColor: '#4f46e5' })),
    ).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1200, 630])
  })

  it('escapes text and is a 404 without a renderer', async () => {
    expect(ogSvg({ title: '<b>&', subtitle: null, siteName: null, themeColor: 'red;"' })).toContain(
      '&lt;b&gt;&amp;',
    )
    expect(ogSvg({ title: 'x', subtitle: null, siteName: null, themeColor: 'red;"' })).toContain(
      'fill="#4f46e5"',
    )
    const app = testApp({ build, resolvers: createResolvers(), session })
    expect((await app.get('/_tenon/og.png?title=x')).status).toBe(404)
  })
})
