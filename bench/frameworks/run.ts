import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { buildProject } from '@tenonkit/core/ir'
import { createDataRuntime } from '@tenonkit/data'
import { renderToString as tenonRender } from '@tenonkit/runtime-server'
import { renderToString as vueRender } from '@vue/server-renderer'
import { build as bundle } from 'esbuild'
import { chromium } from 'playwright-core'
import { h as preactH } from 'preact'
import preactRender from 'preact-render-to-string'
import { createElement } from 'react'
import { renderToString as reactRender } from 'react-dom/server'
import { compile } from 'svelte/compiler'
import { createSSRApp } from 'vue'
import { products } from './apps/data.ts'
import { preactClient, reactClient, svelteClient, tenonClient, vueClient } from './apps/entries.ts'
import { App as PreactApp } from './apps/preact.ts'
import { App as ReactApp } from './apps/react.ts'
import { benchProject, benchResolvers } from './apps/tenon.ts'
import { App as VueApp } from './apps/vue.ts'

const here = fileURLToPath(new URL('.', import.meta.url))
const out = join(here, 'out')
mkdirSync(out, { recursive: true })

const svelteSource = readFileSync(join(here, 'apps/App.svelte'), 'utf8')
writeFileSync(join(out, 'App.server.js'), compile(svelteSource, { generate: 'server' }).js.code)
writeFileSync(join(out, 'App.client.js'), compile(svelteSource, { generate: 'client' }).js.code)
const SvelteApp = (await import(join(out, 'App.server.js'))).default
const { render: svelteRender } = await import('svelte/server')

const props = { products }
const shell = (body: string, name: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>Products</title></head><body><div id="root">${body}</div><script id="props" type="application/json">${JSON.stringify(props).replace(/</g, '\\u003c')}</script><script type="module" src="/${name}/app.js"></script></body></html>`

const tenonBuild = buildProject(benchProject, { sources: false })
const tenonData = createDataRuntime({ build: tenonBuild, resolvers: benchResolvers })

const frameworks: { name: string; version: string; ssr: () => Promise<string> | string; client: string }[] = [
  {
    name: 'react',
    version: '19.3.0',
    ssr: () => shell(reactRender(createElement(ReactApp, props)), 'react'),
    client: reactClient,
  },
  {
    name: 'vue',
    version: '3.5.43',
    ssr: async () => shell(await vueRender(createSSRApp(VueApp, props)), 'vue'),
    client: vueClient,
  },
  {
    name: 'preact',
    version: '10.29.8',
    ssr: () => shell(preactRender(preactH(PreactApp, props)), 'preact'),
    client: preactClient,
  },
  {
    name: 'svelte',
    version: '5.57.1',
    ssr: () => shell(svelteRender(SvelteApp, { props }).body, 'svelte'),
    client: svelteClient,
  },
  {
    name: 'tenon',
    version: 'workspace',
    ssr: async () =>
      (
        await tenonRender({
          build: tenonBuild,
          data: tenonData,
          route: 'home',
          assets: { client: '/tenon/app.js', fns: null, styles: null, preload: [], widgets: {} },
        })
      ).html,
    client: tenonClient,
  },
]

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

async function ssrThroughput(render: () => Promise<string> | string): Promise<number> {
  for (let i = 0; i < 300; i++) await render()
  const rounds: number[] = []
  for (let r = 0; r < 5; r++) {
    const start = performance.now()
    let n = 0
    while (performance.now() - start < 500) {
      await render()
      n++
    }
    rounds.push((n / (performance.now() - start)) * 1000)
  }
  return median(rounds)
}

interface Row {
  name: string
  version: string
  ssrPerSecond: number
  htmlBytes: number
  htmlGzip: number
  jsBytes: number
  jsGzip: number
  hydrateMs: number
  interactiveMs: number
  clicksMs: number
}

const rows: Row[] = []
for (const fw of frameworks) {
  const html = await fw.ssr()
  rmSync(join(out, fw.name), { recursive: true, force: true })
  mkdirSync(join(out, fw.name), { recursive: true })
  writeFileSync(join(out, fw.name, 'index.html'), html)
  const entry = join(here, `.entry-${fw.name}.ts`)
  writeFileSync(entry, fw.client)
  const js = await bundle({
    entryPoints: { app: entry },
    outdir: join(out, fw.name),
    bundle: true,
    splitting: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"', 'globalThis.__TENON_DEV__': 'false' },
    write: false,
  })
  rmSync(entry)
  const files = new Map(js.outputFiles.map((f) => [f.path.slice(f.path.lastIndexOf('/') + 1), f.contents]))
  for (const [name, contents] of files) writeFileSync(join(out, fw.name, name), contents)
  const initial = (name: string, seen = new Set<string>()): Uint8Array[] => {
    if (seen.has(name)) return []
    seen.add(name)
    const contents = files.get(name)!
    const deps = [
      ...Buffer.from(contents)
        .toString()
        .matchAll(/(?:from|import)"\.\/(chunk-[A-Z0-9]+\.js)"/g),
    ].map((m) => m[1]!)
    return [contents, ...deps.flatMap((d) => initial(d, seen))]
  }
  const code = Buffer.concat(initial('app.js'))
  rows.push({
    name: fw.name,
    version: fw.version,
    ssrPerSecond: await ssrThroughput(fw.ssr),
    htmlBytes: Buffer.byteLength(html),
    htmlGzip: gzipSync(html).length,
    jsBytes: code.length,
    jsGzip: initial('app.js').reduce((sum, c) => sum + gzipSync(c).length, 0),
    hydrateMs: 0,
    interactiveMs: 0,
    clicksMs: 0,
  })
}

const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }
const server = createServer((req, res) => {
  const path = join(out, (req.url ?? '/').replace(/\/$/, '/index.html'))
  let body: Buffer
  try {
    body = readFileSync(path)
  } catch {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'text/plain' }).end(body)
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
const { port } = server.address() as AddressInfo

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
})
const RUNS = 10
const CLICKS = 200
for (const row of rows) {
  const hydrate: number[] = []
  const interactive: number[] = []
  const clicks: number[] = []
  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(`http://127.0.0.1:${port}/${row.name}/`)
    await page.waitForFunction(() => (window as unknown as { __hydrated?: unknown }).__hydrated)
    const t = await page.evaluate(
      () => (window as unknown as { __hydrated: { start: number; end: number } }).__hydrated,
    )
    hydrate.push(t.end - t.start)
    interactive.push(t.end)
    const ms = await page.evaluate(async (n) => {
      const button = document.querySelector('button')!
      const start = performance.now()
      for (let i = 0; i < n; i++) {
        button.click()
        await Promise.resolve()
        await Promise.resolve()
      }
      await new Promise((r) => setTimeout(r, 0))
      const text = [...document.querySelectorAll('p')].map((p) => p.textContent).join(' ')
      if (!text.includes(`Cart: ${n} items`)) throw new Error(`unexpected text: ${text}`)
      return performance.now() - start
    }, CLICKS)
    clicks.push(ms)
    await context.close()
  }
  row.hydrateMs = median(hydrate)
  row.interactiveMs = median(interactive)
  row.clicksMs = median(clicks)
}
await browser.close()
server.close()

writeFileSync(join(out, 'results.json'), `${JSON.stringify(rows, null, 2)}\n`)
const fmt = (n: number, d = 1) => n.toFixed(d)
console.log(
  '| Framework | SSR renders/s | HTML (gz) | JS min (gz) | Hydrate ms (4× CPU) | Interactive at ms | 200 clicks ms |',
)
console.log('|---|---|---|---|---|---|---|')
for (const r of rows)
  console.log(
    `| ${r.name} ${r.version} | ${fmt(r.ssrPerSecond, 0)} | ${fmt(r.htmlBytes / 1024)} KB (${fmt(r.htmlGzip / 1024)}) | ${fmt(r.jsBytes / 1024)} KB (${fmt(r.jsGzip / 1024)}) | ${fmt(r.hydrateMs)} | ${fmt(r.interactiveMs)} | ${fmt(r.clicksMs)} |`,
  )
