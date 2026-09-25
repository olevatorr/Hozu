import { bundleWidgets } from '@tenon/bundle'
import { buildProject } from '@tenon/core/ir'
import { createDataRuntime, resolvers } from '@tenon/data'
import { type App, hydrate } from '@tenon/runtime-client'
import { renderToString } from '@tenon/runtime-server'
import { validate } from '@tenon/validator'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import project from './support/meter.ts'

const build = buildProject(project)
const data = createDataRuntime({ build, resolvers: resolvers(project, () => []) })
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('widgets', () => {
  it('declares a typed boundary: IR, validation and bundling', async () => {
    expect(build.diagnostics).toEqual([])
    expect(validate(build.ir, { bindings: build.bindings })).toEqual([])
    expect(build.ir.features.meter!.widgets.Meter).toMatchObject({ tag: 'div', load: 'eager', wraps: false })
    expect(Object.keys(build.ir.features.meter!.widgets.Meter!.events)).toEqual(['picked'])
    const bundle = await bundleWidgets(build)
    expect(bundle.diagnostics).toEqual([])
    const url = bundle.urls['meter.Meter']!
    expect(url).toMatch(/^\/_tenon\/w\/meter-Meter-[A-Z0-9]+\.js$/)
    expect(bundle.files[url]).toContain('v=')
  })

  it('server-renders the host with fallback, mounts the module, updates props, emits events and is destroyed on removal', async () => {
    const { html } = await renderToString({
      build,
      data,
      route: 'home',
      assets: {
        client: '/c.js',
        fns: null,
        styles: null,
        preload: [],
        widgets: { 'meter.Meter': '/w/meter.js', 'meter.Frame': '/w/frame.js' },
      },
    })
    expect(html).toContain('<div class="h-8"><span>Loading meter…</span></div>')
    expect(html).toContain('"meter.Meter":{"url":"/w/meter.js","tag":"div","load":"eager","wraps":false}')
    const window = new Window()
    const document = window.document as unknown as Document
    document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
    const loaded: string[] = []
    const app: App = (
      await hydrate(document, {
        loadWidget: async (u) => {
          loaded.push(u)
          return (
            u.includes('frame')
              ? await import('./support/frame.client.ts')
              : await import('./support/meter.client.ts')
          ).default as never
        },
      })
    ).get('meter')!
    const host = document.querySelector('div.h-8') as HTMLElement
    for (let i = 0; i < 50 && (host.textContent !== 'v=0' || loaded.length < 2); i++) await tick()
    expect(loaded).toEqual(['/w/meter.js', '/w/frame.js'])
    expect(document.querySelector('section')!.dataset.tone).toBe('calm')
    expect(host.textContent).toBe('v=0')
    host.click()
    expect(app.snapshot()?.context).toEqual({ count: 1 })
    expect(host.textContent).toBe('v=1')
    expect(document.querySelector('p')!.textContent).toBe('Count: 1')
    host.click()
    expect(host.className).toBe('h-8 bg-red-500')
    ;[...document.querySelectorAll('button')].find((b) => b.textContent === 'Hide')!.click()
    expect(host.isConnected).toBe(false)
    expect(host.dataset.destroyed).toBe('yes')
  })

  it('TN029 — handlers for events the widget does not declare', () => {
    const ir = structuredClone(build.ir)
    const json = JSON.stringify(ir).replace('"on":{"picked"', '"on":{"pickd"')
    const found = validate(JSON.parse(json), {}).filter((d) => d.code === 'TN029')
    expect(found.map((d) => d.message)).toEqual([
      'Widget meter.Meter does not emit "pickd". Did you mean "picked"?',
    ])
    expect(found[0]!.fix?.patch?.map((p) => p.op)).toEqual(['add', 'remove'])
  })
})
