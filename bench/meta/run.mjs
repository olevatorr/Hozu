import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Agent, request } from 'node:http'
import { createRequire } from 'node:module'
import { arch, cpus, release } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const here = fileURLToPath(new URL('.', import.meta.url))
const { chromium } = createRequire(join(here, '../frameworks/package.json'))('playwright-core')

const RUNS = Number(process.env.BENCH_RUNS ?? 10)
const CLICKS = 200
const CONNECTIONS = 16
const WARMUP_MS = 5000
const ROUND_MS = 5000
const ROUNDS = 3
const HOST = '127.0.0.1'

const version = (dir, pkg) =>
  JSON.parse(readFileSync(join(here, dir, 'node_modules', pkg, 'package.json'), 'utf8')).version
const hozuVersion = JSON.parse(readFileSync(join(here, '../../packages/cli/package.json'), 'utf8')).version
const hozuCommit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: here,
  encoding: 'utf8',
}).stdout.trim()

const servers = [
  {
    name: 'next',
    dir: 'next',
    port: 4811,
    build: ['node_modules/next/dist/bin/next', 'build'],
    start: (port) => ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', HOST],
    label: () =>
      `Next.js ${version('next', 'next')} (App Router, React ${version('next', 'react')}, react-dom ${version('next', 'react-dom')})`,
    pages: [
      { id: 'next', path: '/', mode: "per request (`dynamic = 'force-dynamic'`)" },
      { id: 'next-static', path: '/static', mode: "static prerender (`dynamic = 'force-static'`)" },
    ],
  },
  {
    name: 'nuxt',
    dir: 'nuxt',
    port: 4812,
    build: ['node_modules/nuxt/bin/nuxt.mjs', 'build'],
    start: () => ['.output/server/index.mjs'],
    label: () =>
      `Nuxt ${version('nuxt', 'nuxt')} (Vue ${version('nuxt', 'vue')}, Nitro ${version('nuxt', 'nitropack')}, node-server preset)`,
    pages: [{ id: 'nuxt', path: '/', mode: 'per request (SSR, no route rules)' }],
  },
  {
    name: 'sveltekit',
    dir: 'sveltekit',
    port: 4813,
    build: ['node_modules/vite/bin/vite.js', 'build'],
    start: () => ['build/index.js'],
    label: () =>
      `SvelteKit ${version('sveltekit', '@sveltejs/kit')} (Svelte ${version('sveltekit', 'svelte')}, adapter-node ${version('sveltekit', '@sveltejs/adapter-node')})`,
    pages: [{ id: 'sveltekit', path: '/', mode: 'per request (SSR, prerender off)' }],
  },
  {
    name: 'hozu',
    dir: 'hozu',
    port: 4814,
    build: null,
    start: () => ['node_modules/@hozu/cli/bin/hozu.js', 'serve'],
    label: () => `Hozu ${hozuVersion} (workspace build @ ${hozuCommit}, hozu serve → @hozu/adapter-node)`,
    pages: [{ id: 'hozu', path: '/', mode: "per request (query `freshness: 'request'`)" }],
  },
  {
    name: 'baseline',
    dir: '.',
    port: 4815,
    build: null,
    rpsOnly: true,
    start: () => ['baseline.mjs'],
    label: () => `node:http ${process.version} calibration (fixed 12 KB buffer, no framework)`,
    pages: [{ id: 'baseline', path: '/', mode: 'load-generator ceiling' }],
  },
]

const only = process.env.BENCH_ONLY?.split(',')
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function get(agent, port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ agent, host: HOST, port, path, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
      )
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

async function waitUp(port, path) {
  const agent = new Agent()
  for (let i = 0; i < 300; i++) {
    try {
      const r = await get(agent, port, path)
      if (r.status === 200) return agent.destroy()
    } catch {}
    await sleep(100)
  }
  throw new Error(`server on ${port} did not answer 200 on ${path}`)
}

async function load(port, path, ms, headers) {
  const agent = new Agent({ keepAlive: true, maxSockets: CONNECTIONS })
  let done = 0
  let bad = 0
  const end = performance.now() + ms
  const worker = async () => {
    while (performance.now() < end) {
      const r = await get(agent, port, path, headers)
      if (r.status === 200 && r.body.length > 0) done++
      else bad++
    }
  }
  const start = performance.now()
  await Promise.all(Array.from({ length: CONNECTIONS }, worker))
  const elapsed = performance.now() - start
  agent.destroy()
  if (bad) throw new Error(`${bad} non-200 responses on ${path}`)
  return (done / elapsed) * 1000
}

async function throughput(port, path, headers = {}) {
  await load(port, path, WARMUP_MS, headers)
  const rounds = []
  for (let r = 0; r < ROUNDS; r++) rounds.push(await load(port, path, ROUND_MS, headers))
  return { median: median(rounds), rounds }
}

const hozuTiming = (source) =>
  source.replace(
    /(\w+)\(document\);?\s*$/,
    'var __hs=performance.now();$1(document).then(()=>{window.__hydrated={start:__hs,end:performance.now()}});',
  )

async function bytesAndSanity(browser, url, isHozu) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const scripts = []
  const other = []
  page.on('response', async (response) => {
    const type = response.request().resourceType()
    if (type === 'document') return
    const headers = response.headers()
    const entry = { url: response.url(), type, encoding: headers['content-encoding'] ?? 'identity' }
    if (type === 'script' || /javascript/.test(headers['content-type'] ?? ''))
      scripts.push({ ...entry, response })
    else other.push(entry)
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(
    (hozu) => (hozu ? document.documentElement.hasAttribute('data-hozu-ready') : window.__hydrated),
    isHozu,
  )
  await sleep(500)
  const files = []
  for (const s of scripts) {
    const body = await s.response.body()
    const sizes = await s.response.request().sizes()
    files.push({
      url: s.url,
      type: s.type,
      encoding: s.encoding,
      raw: body.length,
      gzip: gzipSync(body).length,
      transferred: sizes.responseBodySize,
    })
  }
  const dom = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent,
    items: document.querySelectorAll('li').length,
    buttons: document.querySelectorAll('li button').length,
    cart: [...document.querySelectorAll('p')].map((p) => p.textContent).join(' '),
  }))
  const inlineScripts = await page.evaluate(() =>
    [...document.querySelectorAll('script:not([src])')].reduce((n, s) => n + s.textContent.length, 0),
  )
  await context.close()
  return { files, other, dom, inlineScripts }
}

async function timings(browser, url, isHozu) {
  const hydrate = []
  const interactive = []
  const clicks = []
  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext()
    const page = await context.newPage()
    if (isHozu)
      await page.route('**/_hozu/client.js', async (route) => {
        const response = await route.fetch()
        await route.fulfill({ response, body: hozuTiming(await response.text()) })
      })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(url)
    await page.waitForFunction(() => window.__hydrated, null, { timeout: 30000 })
    const t = await page.evaluate(() => window.__hydrated)
    hydrate.push(t.end - t.start)
    interactive.push(t.end)
    clicks.push(
      await page.evaluate(async (n) => {
        const button = document.querySelector('li button')
        const start = performance.now()
        for (let i = 0; i < n; i++) {
          button.click()
          await Promise.resolve()
          await Promise.resolve()
        }
        await new Promise((r) => setTimeout(r, 0))
        const text = [...document.querySelectorAll('p')].map((p) => p.textContent).join(' ')
        if (!text.includes(`Cart: ${n} items`)) throw new Error(`unexpected counter text: ${text}`)
        return performance.now() - start
      }, CLICKS),
    )
    await context.close()
  }
  return {
    hydrateMs: median(hydrate),
    interactiveMs: median(interactive),
    clicksMs: median(clicks),
    samples: { hydrate, interactive, clicks },
  }
}

function startServer(s) {
  const child = spawn(process.execPath, s.start(s.port), {
    cwd: join(here, s.dir),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(s.port),
      HOST,
      NEXT_TELEMETRY_DISABLED: '1',
      NUXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  return { child, log: () => log }
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (server.child.exitCode !== null) return resolve()
    const force = setTimeout(() => server.child.kill('SIGKILL'), 5000)
    server.child.once('exit', () => {
      clearTimeout(force)
      resolve()
    })
    server.child.kill('SIGTERM')
  })
}

if (process.argv.includes('--build'))
  for (const s of servers.filter((x) => x.build && (!only || only.includes(x.name)))) {
    console.error(`building ${s.name}`)
    const r = spawnSync(process.execPath, s.build, {
      cwd: join(here, s.dir),
      stdio: ['ignore', 2, 2],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        NUXT_TELEMETRY_DISABLED: '1',
      },
    })
    if (r.status !== 0) throw new Error(`${s.name} build failed`)
  }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const rows = []
for (const s of servers.filter((x) => !only || only.includes(x.name))) {
  console.error(`starting ${s.name} on ${s.port}`)
  const server = startServer(s)
  try {
    for (const p of s.pages) await waitUp(s.port, p.path)
    for (const p of s.pages) {
      if (s.rpsOnly) {
        console.error(`  ${p.id}: requests/s`)
        const rps = await throughput(s.port, p.path)
        rows.push({
          id: p.id,
          framework: s.label(),
          mode: p.mode,
          path: p.path,
          rpsOnly: true,
          failures: [],
          rps: rps.median,
          rpsRounds: rps.rounds,
        })
        continue
      }
      const url = `http://${HOST}:${s.port}${p.path}`
      const agent = new Agent()
      const html = await get(agent, s.port, p.path)
      const htmlGz = await get(agent, s.port, p.path, { 'accept-encoding': 'gzip, deflate, br' })
      agent.destroy()
      const ssrItems = (html.body.toString().match(/<li[\s>]/g) ?? []).length
      const failures = []
      if (ssrItems !== 100) failures.push(`server HTML has ${ssrItems} <li>, expected 100`)
      console.error(`  ${p.id}: bytes + sanity`)
      const b = await bytesAndSanity(browser, url, s.name === 'hozu')
      if (b.dom.items !== 100) failures.push(`DOM has ${b.dom.items} <li>, expected 100`)
      if (b.dom.buttons !== 100) failures.push(`DOM has ${b.dom.buttons} Add buttons, expected 100`)
      if (b.dom.h1 !== 'Products') failures.push(`h1 is ${b.dom.h1}`)
      if (!b.dom.cart.includes('Cart: 0 items')) failures.push(`counter reads ${b.dom.cart}`)
      console.error(`  ${p.id}: requests/s`)
      const rps = await throughput(s.port, p.path)
      const rpsGzip = await throughput(s.port, p.path, { 'accept-encoding': 'gzip, deflate, br' })
      console.error(`  ${p.id}: browser timings (${RUNS} cold loads)`)
      let t = null
      try {
        t = await timings(browser, url, s.name === 'hozu')
      } catch (error) {
        failures.push(`timing run failed: ${error.message}`)
      }
      rows.push({
        id: p.id,
        framework: s.label(),
        mode: p.mode,
        path: p.path,
        failures,
        rps: rps.median,
        rpsRounds: rps.rounds,
        rpsGzip: rpsGzip.median,
        rpsGzipRounds: rpsGzip.rounds,
        htmlEncodingWhenAccepted: htmlGz.headers['content-encoding'] ?? 'identity',
        htmlBytes: html.body.length,
        htmlGzip: gzipSync(html.body).length,
        inlineScriptChars: b.inlineScripts,
        jsFiles: b.files,
        jsCount: b.files.length,
        jsBytes: b.files.reduce((n, f) => n + f.raw, 0),
        jsGzip: b.files.reduce((n, f) => n + f.gzip, 0),
        jsTransferred: b.files.reduce((n, f) => n + f.transferred, 0),
        otherRequests: b.other,
        dom: b.dom,
        ...(t ?? {}),
      })
    }
  } finally {
    await stopServer(server)
  }
}
const chrome = browser.version()
await browser.close()

const meta = {
  date: new Date().toISOString(),
  node: process.version,
  chrome,
  os: `${process.platform} ${release()} ${arch()}`,
  cpu: cpus()[0]?.model,
  runs: RUNS,
  clicks: CLICKS,
  load: { connections: CONNECTIONS, warmupMs: WARMUP_MS, roundMs: ROUND_MS, rounds: ROUNDS },
}
mkdirSync(join(here, 'out'), { recursive: true })
writeFileSync(join(here, 'out/results.json'), `${JSON.stringify({ meta, rows }, null, 2)}\n`)

const kb = (n) => (n / 1024).toFixed(1)
const ms = (n) => (n === undefined ? '—' : n.toFixed(1))
console.log(`Node ${meta.node} · Chrome ${meta.chrome} · ${meta.cpu} · ${meta.os}\n`)
console.log(
  '| Framework (exact versions) | Page | req/s (identity) | req/s (gzip accepted) | HTML KB (gz) | JS files | JS KB (gz) | Hydrate ms | Interactive at ms | 200 clicks ms |',
)
console.log('|---|---|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  if (r.rpsOnly) {
    console.log(`| ${r.framework} | ${r.mode} | ${r.rps.toFixed(0)} | — | — | — | — | — | — | — |`)
    continue
  }
  if (r.failures.length) {
    console.log(`| ${r.framework} | ${r.mode} | FAILED: ${r.failures.join('; ')} |||||||||`)
    continue
  }
  console.log(
    `| ${r.framework} | ${r.mode} | ${r.rps.toFixed(0)} | ${r.rpsGzip.toFixed(0)} (${r.htmlEncodingWhenAccepted}) | ${kb(r.htmlBytes)} (${kb(r.htmlGzip)}) | ${r.jsCount} | ${kb(r.jsBytes)} (${kb(r.jsGzip)}) | ${ms(r.hydrateMs)} | ${ms(r.interactiveMs)} | ${ms(r.clicksMs)} |`,
  )
}
