import { bundleWidgets } from '@hozu/bundle'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { type App, hydrate } from '@hozu/runtime-client'
import { renderToString } from '@hozu/runtime-server'
import { validate } from '@hozu/validator'
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
    expect(url).toMatch(/^\/_hozu\/w\/meter-Meter-[A-Z0-9]+\.js$/)
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
    const tone = () => document.querySelector('section')!.dataset.tone
    for (let i = 0; i < 200 && (host.textContent !== 'v=0' || loaded.length < 2 || !tone()); i++) await tick()
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

  it('HZ029 — handlers for events the widget does not declare', () => {
    const ir = structuredClone(build.ir)
    const json = JSON.stringify(ir).replace('"on":{"picked"', '"on":{"pickd"')
    const found = validate(JSON.parse(json), {}).filter((d) => d.code === 'HZ029')
    expect(found.map((d) => d.message)).toEqual([
      'Widget meter.Meter does not emit "pickd". Did you mean "picked"?',
    ])
    expect(found[0]!.fix?.patch?.map((p) => p.op)).toEqual(['add', 'remove'])
  })
})

describe('a missing widget bundle', () => {
  it('fails at startup instead of rendering hosts that never mount', async () => {
    const { createHandler } = await import('@hozu/runtime-server')
    const { exportStatic } = await import('@hozu/adapter-static')
    const { testApp } = await import('@hozu/testing')
    const options = { build, resolvers: resolvers(project, () => []) }
    const missing =
      /Widgets meter\.Frame, meter\.Meter are used in views, but no widget bundle was given.*bundleWidgets/
    expect(() => createHandler(options)).toThrow(missing)
    await expect(exportStatic({ ...options, outDir: '/nonexistent' })).rejects.toThrow(missing)
    expect(() =>
      createHandler({ ...options, widgets: { urls: { 'meter.Meter': '/w/m.js' }, files: {} } }),
    ).toThrow(/no client code for meter\.Frame; check the diagnostics of bundleWidgets \(HZ029\)/)
    const bundle = await bundleWidgets(build)
    expect(() => createHandler({ ...options, widgets: bundle })).not.toThrow()
    expect((await testApp(options).get('/')).status).toBe(200)
  })
})
