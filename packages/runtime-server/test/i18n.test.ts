import { buildProject } from '@hozu/core/ir'
import { hydrate } from '@hozu/runtime-client'
import { appOptionsOf, createHandler } from '@hozu/runtime-server'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import createResolversApp from '../../../examples/blog/app.ts'
import project from '../../../examples/blog/hozu.config.ts'

const createResolvers = () => appOptionsOf(createResolversApp)!.resolvers

const build = buildProject(project, { sources: false })
const handler = createHandler({ build, resolvers: createResolvers(), session: () => ({ userId: 'ada' }) })
const get = (path: string, headers: Record<string, string> = {}) =>
  handler.fetch(new Request(`https://blog.hozu.dev${path}`, { headers }))
const where = async (path: string, headers: Record<string, string> = {}) => {
  const r = await get(path, headers)
  return [r.status, r.headers.get('location')]
}

describe('internationalisation (ADR 0017, ADR 0043 F)', () => {
  it('keeps the default locale unprefixed, prefixes the others and never negotiates', async () => {
    expect(await where('/', { 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.5' })).toEqual([200, null])
    expect((await get('/')).headers.get('vary')).not.toContain('Accept-Language')
    expect(await where('/posts/hello-hozu?x=1', { 'accept-language': 'zh-TW' })).toEqual([200, null])
    expect(await where('/en')).toEqual([308, '/'])
    expect(await where('/en/posts/hello-hozu?x=1')).toEqual([308, '/posts/hello-hozu?x=1'])
    expect(await where('/zh-TW/')).toEqual([308, '/zh-TW'])
    expect((await get('/fr/posts/hello-hozu')).status).toBe(404)
    expect((await get('/zh-TW/posts/hello-hozu')).status).toBe(200)
    expect(await (await get('/')).text()).toContain('<html lang="en">')
  })

  it('derives lang, hreflang alternates and og:locale, and translates the head', async () => {
    const html = await (await get('/zh-TW/posts/hello-hozu')).text()
    for (const tag of [
      '<html lang="zh-TW">',
      '<link rel="canonical" href="https://blog.hozu.dev/zh-TW/posts/hello-hozu">',
      '<link rel="alternate" hreflang="en" href="https://blog.hozu.dev/posts/hello-hozu">',
      '<link rel="alternate" hreflang="zh-TW" href="https://blog.hozu.dev/zh-TW/posts/hello-hozu">',
      '<link rel="alternate" hreflang="x-default" href="https://blog.hozu.dev/posts/hello-hozu">',
      '<meta property="og:locale" content="zh_TW">',
      '<meta property="og:locale:alternate" content="en_US">',
      '<a href="/posts/hello-hozu" hreflang="en" lang="en">English</a>',
    ])
      expect(html).toContain(tag)
    const home = await (await get('/zh-TW')).text()
    expect(home).toContain('<title>Hozu 部落格 — AI 優先前端筆記</title>')
    expect(home).toContain('href="/zh-TW/posts/hello-hozu"')
  })

  it('formats with Intl for the page locale', async () => {
    const zh = await (await get('/zh-TW/posts/hello-hozu')).text()
    const en = await (await get('/posts/hello-hozu')).text()
    expect(zh).toContain('Ada · 2026年9月1日')
    expect(en).toContain('By Ada · September 1, 2026')
  })

  it('ships only the page locale to islands and keeps plurals working in the browser', async () => {
    const html = await (await get('/zh-TW')).text()
    const payload = /id="hozu-payload">(.*?)<\/script>/.exec(html)![1]!
    expect(payload).toContain('已儲存 # 篇')
    expect(payload).not.toContain('posts saved')
    expect(payload).not.toContain('Your reading list')
    const window = new Window({ url: 'https://blog.hozu.dev/zh-TW' })
    const document = window.document as unknown as Document
    document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
    const apps = await hydrate(document, {
      loadFns: async () => build.bindings.fns as never,
      transport: async () => ({
        result: { ok: true, value: {} },
        refreshed: [['saved.savedPosts{}', { ok: true, value: ['hello-hozu'] }]],
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
