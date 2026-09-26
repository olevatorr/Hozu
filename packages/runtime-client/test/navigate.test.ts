import { buildProject } from '@tenonkit/core/ir'
import { createDataRuntime } from '@tenonkit/data'
import { hydrate } from '@tenonkit/runtime-client'
import { renderToString } from '@tenonkit/runtime-server'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { createResolvers } from '../../../examples/cart/server.ts'
import project from '../../../examples/cart/tenon.config.ts'
import { routeOf } from '../src/navigate.ts'

const build = buildProject(project, { sources: false })
const data = createDataRuntime({ build, resolvers: createResolvers() })
const session = { userId: 'ada' }
const page = async (route: string, params: Record<string, string> | null = null) =>
  (await renderToString({ build, data, route, params, session })).html

async function browse(pages: Record<string, string>) {
  const window = new Window({ url: 'http://localhost/' })
  const document = window.document as unknown as Document
  document.write((await page('home')).replace(/<script type="module"[^>]*><\/script>/, ''))
  const navigation = new window.EventTarget()
  const listening = new Promise<void>((resolve) => {
    const add = navigation.addEventListener.bind(navigation)
    navigation.addEventListener = ((...args: Parameters<typeof add>) => {
      add(...args)
      resolve()
    }) as typeof add
  })
  Object.assign(window, {
    navigation,
    fetch: vi.fn(async (url: string) => {
      const html = pages[new URL(url).pathname]
      return new Response(html ?? 'missing', {
        status: html ? 200 : 404,
        headers: { 'content-type': 'text/html' },
      })
    }),
  })
  const apps = await hydrate(document, {
    loadFns: async () => build.bindings.fns as never,
    transport: () => new Promise(() => {}),
  })
  await listening
  const go = async (path: string) => {
    let handler: (() => Promise<void>) | null = null
    const event = Object.assign(new window.Event('navigate'), {
      canIntercept: true,
      hashChange: false,
      downloadRequest: null,
      formData: null,
      navigationType: 'push',
      destination: { url: new URL(path, 'http://localhost').href },
      intercept: (options: { handler: () => Promise<void> }) => {
        handler = options.handler
      },
    })
    navigation.dispatchEvent(event)
    if (handler) await (handler as () => Promise<void>)()
    return handler !== null
  }
  return { window, document, apps, go }
}

describe('soft navigation (ADR 0015)', () => {
  it('keeps a shared island view, its DOM and its machine, and swaps everything else', async () => {
    const { document, apps, go, window } = await browse({
      '/products/mug': await page('product', { sku: 'mug' }),
    })
    const panel = document.querySelector('section:last-of-type')!
    const input = document.querySelector('input[name="qty"]') as HTMLInputElement
    input.value = '4'
    input.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event)
    const app = apps.get('cart')!
    expect(app.snapshot()?.context).toMatchObject({ pending: { qty: 4 } })
    expect(document.body.textContent).toContain('Products')

    expect(await go('/products/mug')).toBe(true)

    expect(document.title).toBe('Mug')
    expect(document.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe(
      'https://cart.tenon.dev/products/mug',
    )
    expect(document.querySelector('h2')?.textContent).toBe('Mug — $12')
    expect(document.body.textContent).not.toContain('Products')
    expect(document.querySelector('section:last-of-type')).toBe(panel)
    expect(document.querySelector('input[name="qty"]')).toBe(input)
    expect(apps.get('cart')).toBe(app)
    expect(app.snapshot()?.context).toMatchObject({ pending: { qty: 4 } })
    expect(document.querySelector('[aria-live="polite"]:not(p)')?.textContent).toBe('Mug')
    expect(document.documentElement.hasAttribute('data-tenon-navigating')).toBe(false)
    expect(document.querySelectorAll('title')).toHaveLength(1)
  })

  it('stays interactive after the swap and keeps later swaps in order', async () => {
    const { document, apps, go } = await browse({
      '/products/mug': await page('product', { sku: 'mug' }),
      '/': await page('home'),
    })
    await go('/products/mug')
    expect(await go('/')).toBe(true)
    const sections = [...document.querySelectorAll('body > section')].map(
      (s) => s.querySelector('h2')?.textContent,
    )
    expect(sections).toEqual(['Products', 'Cart'])
    const add = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Add')!
    add.click()
    expect(apps.get('cart')!.snapshot()?.state).toBe('adding')
  })

  it('leaves links to pages without kept views, and failed fetches, to the browser', async () => {
    const { go, window } = await browse({})
    expect(await go('/order/placed')).toBe(false)
    expect(await go('https://elsewhere.example/products/mug')).toBe(false)
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {})
    expect(await go('/products/nope')).toBe(true)
    expect(replace).toHaveBeenCalledWith('http://localhost/products/nope')
  })

  it('matches only the current locale, so a language switch is a document navigation (ADR 0017)', () => {
    const routes = { home: '/en', post: '/en/posts/:slug' }
    expect(routeOf(routes, '/en/posts/a')).toBe('post')
    expect(routeOf(routes, '/en')).toBe('home')
    expect(routeOf(routes, '/zh-TW/posts/a')).toBeNull()
  })
})
