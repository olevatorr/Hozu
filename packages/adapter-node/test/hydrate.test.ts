// @vitest-environment happy-dom
import { hydrate } from '@tenon/runtime-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { build, start } from './support.ts'

let close: (() => Promise<void>) | null = null
afterEach(async () => {
  await close?.()
  close = null
})

const settle = () => new Promise((r) => setTimeout(r, 30))

describe('end-to-end hydration', () => {
  it('hydrates only islands, never fetches queries, and applies server-pushed data after a mutation', async () => {
    const app = start()
    close = app.close
    const html = (await app.call('GET', '/')).body
    document.open()
    document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
    document.close()
    const heading = document.querySelector('[data-t="catalog.ProductGrid/0"]')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const transport = vi.fn(async (effect: string, input: unknown, keys: string[]) =>
      JSON.parse((await app.call('POST', '/_tenon/effect', { effect, input, keys })).body),
    )
    const apps = await hydrate(document, { transport, loadFns: async () => build.bindings.fns as never })
    expect([...apps.keys()]).toEqual(['cart'])
    expect(document.querySelector('[data-t="catalog.ProductGrid/0"]')).toBe(heading)
    expect(transport).not.toHaveBeenCalled()

    const add = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Add')!
    add.click()
    expect(apps.get('cart')!.snapshot()?.state).toBe('adding')
    await settle()
    expect(transport).toHaveBeenCalledWith('cart.addItem', { sku: 'mug', qty: 1 }, ['cart.getCart{}'])
    expect(apps.get('cart')!.snapshot()?.state).toBe('idle')
    expect(document.body.textContent).toContain('Mug × 1')
    expect(document.body.textContent).toContain('Total: $12')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
