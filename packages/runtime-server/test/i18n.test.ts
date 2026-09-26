import { buildProject } from '@tenon/core/ir'
import { hydrate } from '@tenon/runtime-client'
import { createHandler } from '@tenon/runtime-server'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { createResolvers } from '../../../examples/blog/server.ts'
import project from '../../../examples/blog/tenon.config.ts'

const build = buildProject(project, { sources: false })
const handler = createHandler({ build, resolvers: createResolvers(), session: () => ({ userId: 'ada' }) })
const get = (path: string, headers: Record<string, string> = {}) =>
  handler.fetch(new Request(`https://blog.tenon.dev${path}`, { headers }))
const where = async (path: string, headers: Record<string, string> = {}) => {
  const r = await get(path, headers)
  return [r.status, r.headers.get('location')]
}

describe('internationalisation (ADR 0017)', () => {
  it('puts every page under a locale and negotiates only locale-less URLs', async () => {
    expect(await where('/', { 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.5' })).toEqual([307, '/zh-TW'])
    expect(await where('/', { 'accept-language': 'zh-HK' })).toEqual([307, '/zh-TW'])
    expect(await where('/', { 'accept-language': 'fr' })).toEqual([307, '/en'])
    expect(await where('/')).toEqual([307, '/en'])
    expect((await get('/')).headers.get('vary')).toBe('Accept-Language')
    expect(await where('/posts/hello-tenon?x=1', { 'accept-language': 'zh-TW' })).toEqual([
      307,
      '/zh-TW/posts/hello-tenon?x=1',
    ])
    expect(await where('/zh-TW/')).toEqual([308, '/zh-TW'])
    expect((await get('/fr/posts/hello-tenon')).status).toBe(404)
    expect((await get('/zh-TW/posts/hello-tenon')).status).toBe(200)
  })

  it('derives lang, hreflang alternates and og:locale, and translates the head', async () => {
    const html = await (await get('/zh-TW/posts/hello-tenon')).text()
    for (const tag of [
      '<html lang="zh-TW">',
      '<link rel="canonical" href="https://blog.tenon.dev/zh-TW/posts/hello-tenon">',
      '<link rel="alternate" hreflang="en" href="https://blog.tenon.dev/en/posts/hello-tenon">',
      '<link rel="alternate" hreflang="zh-TW" href="https://blog.tenon.dev/zh-TW/posts/hello-tenon">',
      '<link rel="alternate" hreflang="x-default" href="https://blog.tenon.dev/en/posts/hello-tenon">',
      '<meta property="og:locale" content="zh_TW">',
      '<meta property="og:locale:alternate" content="en">',
      '<a href="/en/posts/hello-tenon" hreflang="en" lang="en">English</a>',
    ])
      expect(html).toContain(tag)
    const home = await (await get('/zh-TW')).text()
    expect(home).toContain('<title>Tenon 部落格 — AI 優先前端筆記</title>')
    expect(home).toContain('href="/zh-TW/posts/hello-tenon"')
  })

  it('formats with Intl for the page locale', async () => {
    const zh = await (await get('/zh-TW/posts/hello-tenon')).text()
    const en = await (await get('/en/posts/hello-tenon')).text()
    expect(zh).toContain('Ada · 2026年9月1日')
    expect(en).toContain('By Ada · September 1, 2026')
  })

  it('ships only the page locale to islands and keeps plurals working in the browser', async () => {
    const html = await (await get('/zh-TW')).text()
    const payload = /id="tenon-payload">(.*?)<\/script>/.exec(html)![1]!
    expect(payload).toContain('已儲存 # 篇')
    expect(payload).not.toContain('posts saved')
    expect(payload).not.toContain('Your reading list')
    const window = new Window({ url: 'https://blog.tenon.dev/zh-TW' })
    const document = window.document as unknown as Document
    document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
    const apps = await hydrate(document, {
      loadFns: async () => build.bindings.fns as never,
      transport: async () => ({
        result: { ok: true, value: {} },
        refreshed: [['saved.savedPosts{}', { ok: true, value: ['hello-tenon'] }]],
      }),
    })
    const count = () => [...document.querySelectorAll('aside li')].at(-1)?.textContent
    expect(count()).toBe('還沒有儲存任何文章')
    const save = [...document.querySelectorAll('aside button')].find((b) => b.textContent === '儲存')!
    ;(save as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 10))
    expect(apps.get('saved')?.snapshot()?.state).toBe('idle')
    expect(count()).toBe('已儲存 1 篇')
  })
})
