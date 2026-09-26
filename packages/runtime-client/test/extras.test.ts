import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { type App, hydrate } from '@hozu/runtime-client'
import { renderToString } from '@hozu/runtime-server'
import { validate } from '@hozu/validator'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import site, { note } from './support/extras.ts'

const build = buildProject(site)
const data = createDataRuntime({
  build,
  resolvers: resolvers(site, (implement) => [implement(note, () => ({ html: '<b>Bold</b> <i>note</i>' }))]),
})
const frames = () => new Promise((r) => setTimeout(r, 60))

describe('capability parity: conditional, primitive lists, links, window events, trusted HTML', () => {
  it('validates clean and server-renders every construct', async () => {
    expect(build.diagnostics).toEqual([])
    expect(validate(build.ir, { bindings: build.bindings }).map((d) => d.code)).toEqual(['HZ025'])
    const { html } = await renderToString({ build, data, route: 'home' })
    expect(html).toContain('<p class="empty">Nothing yet</p>')
    expect(html).toContain('<li>alpha</li><li>beta</li>')
    expect(html).toContain('<a href="/items/a%20b">Item</a>')
    expect(html).toContain('<div class="note"><b>Bold</b> <i>note</i></div>')
  })

  it('switches branches on data with motion, keys primitives by value, listens on window', async () => {
    const { html } = await renderToString({ build, data, route: 'home' })
    const window = new Window({ width: 1024, height: 768 })
    const document = window.document as unknown as Document
    document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
    const app: App = (await hydrate(document, { loadFns: async () => ({}) })).get('extras')!
    const input = document.querySelector('input')!
    input.value = 'hello'
    input.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event)
    expect(document.querySelector('p.draft')!.textContent).toBe('Draft: hello')
    expect(document.querySelector('p.draft')!.className).toBe('draft fade-enter-from fade-enter-active')
    await frames()
    expect(document.querySelector('p.empty')).toBeNull()
    const li = document.querySelector('li')!
    ;(document.querySelector('button') as HTMLButtonElement).click()
    expect([...document.querySelectorAll('li')].map((x) => x.textContent)).toEqual(['alpha', 'beta', 'gamma'])
    expect(document.querySelector('li')).toBe(li)
    window.dispatchEvent(new window.Event('resize') as never)
    expect(app.snapshot()?.context).toMatchObject({ width: 1024 })
    expect(document.querySelector('p.width')!.textContent).toBe('Width: 1024')
  })

  it('HZ030 — ui.html of client-controlled data', () => {
    const ir = structuredClone(build.ir)
    const json = JSON.stringify(ir).replace(
      '"kind":"html","value":{"ref":"binding","depth":0,"path":["html"]}',
      '"kind":"html","value":{"ref":"context","path":["draft"]}',
    )
    const found = validate(JSON.parse(json), {}).filter((d) => d.code === 'HZ030')
    expect(found.map((d) => d.message)).toEqual(['ui.html renders a value the client or URL controls'])
    expect(found[0]!.fix?.patch?.[0]).toMatchObject({ op: 'replace', value: { kind: 'text' } })
  })
})
