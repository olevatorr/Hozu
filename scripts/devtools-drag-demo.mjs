#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4980
const STEPS = 30
const STEP_MS = 25
const repo = fileURLToPath(new URL('../', import.meta.url))
const app = process.argv[2] ? resolve(process.argv[2]) : null
if (!app || !existsSync(join(app, 'hozu.config.ts'))) {
  console.error('usage: node scripts/devtools-drag-demo.mjs <app dir with hozu.config.ts>')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome = [
  process.env.HOZU_CHROME,
  process.env.CHROME_PATH,
  process.env.CHROMIUM_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p))
if (!chrome) {
  console.error('No Chrome found: set CHROMIUM_PATH')
  process.exit(1)
}

const own = join(app, 'node_modules/.bin/hozu')
const devArgs = existsSync(own)
  ? [own, ['dev']]
  : [process.execPath, [join(repo, 'packages/cli/bin/hozu.js'), 'dev']]
const server = spawn(devArgs[0], devArgs[1], {
  cwd: app,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (d) => {
  serverLog += d
})
server.stderr.on('data', (d) => {
  serverLog += d
})
const base = `http://localhost:${PORT}`

const profile = mkdtempSync(join(tmpdir(), 'hozu-drag-demo-'))
let browser = null
const stop = async (code) => {
  browser?.kill()
  server.kill('SIGTERM')
  await sleep(300)
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
  process.exit(code)
}
process.on('SIGINT', () => void stop(130))

const waitFor = async (what, check, ms = 60_000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = await check().catch(() => null)
    if (value) return value
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.id = 0
    this.pending = new Map()
    this.ws.addEventListener('message', (e) => {
      const msg = JSON.parse(String(e.data))
      const wait = this.pending.get(msg.id)
      if (!wait) return
      this.pending.delete(msg.id)
      if (msg.error) wait.reject(new Error(`${msg.error.message} (${wait.method})`))
      else wait.resolve(msg.result)
    })
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }))
  }
}

const shadow = `document.querySelector('hozu-devtools')?.shadowRoot`
const outline = `document.querySelector('hozu-devtools-outline')?.shadowRoot`
let page
let at = { x: 200, y: 200 }

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
  return result.value
}
const until = (what, expression, ms = 20_000) => waitFor(what, () => evaluate(expression), ms)

const cursor = () =>
  evaluate(`(() => {
    if (document.getElementById('hozu-demo-cursor')) return true
    const c = document.createElement('div')
    c.id = 'hozu-demo-cursor'
    c.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;' +
      'border:2px solid #fb3a0e;background:rgba(251,58,14,.25);pointer-events:none;z-index:2147483647;' +
      'transition:transform .1s;box-shadow:0 0 0 2px #fff'
    document.documentElement.append(c)
    return true
  })()`)
const showCursor = (x, y, down) =>
  evaluate(
    `(() => { const c = document.getElementById('hozu-demo-cursor'); if (c) { c.style.left = '${x}px'; c.style.top = '${y}px'; c.style.transform = '${down ? 'scale(.7)' : 'none'}' } })()`,
  )

const mouse = (type, x, y, held) =>
  page.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: held || type !== 'mouseMoved' ? 'left' : 'none',
    buttons: held ? 1 : 0,
    clickCount: 1,
  })
const moveTo = async (x, y, held = false) => {
  const from = at
  for (let i = 1; i <= STEPS; i++) {
    const p = { x: from.x + ((x - from.x) * i) / STEPS, y: from.y + ((y - from.y) * i) / STEPS }
    await mouse('mouseMoved', p.x, p.y, held)
    await showCursor(p.x, p.y, held)
    await sleep(STEP_MS)
  }
  at = { x, y }
}
const centerOf = (root, selector) =>
  until(
    selector,
    `(() => { const el = ${root}?.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`,
  )
const buttonIn = (selector, text) =>
  until(
    `${selector} "${text}"`,
    `(() => { const b = [...${shadow}.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)})); if (!b) return null; const r = b.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`,
  )
const click = async (p) => {
  await moveTo(p.x, p.y)
  await mouse('mousePressed', p.x, p.y, true)
  await showCursor(p.x, p.y, true)
  await sleep(90)
  await mouse('mouseReleased', p.x, p.y, false)
  await showCursor(p.x, p.y, false)
  await sleep(400)
}
const type = async (text) => {
  for (const ch of text) {
    await page.send('Input.insertText', { text: ch })
    await sleep(45)
  }
}

const drag = async (tile, target, expect) => {
  const from = await centerOf(shadow, tile)
  await moveTo(from.x, from.y)
  await sleep(300)
  await mouse('mousePressed', from.x, from.y, true)
  await showCursor(from.x, from.y, true)
  await sleep(150)
  const to = await target()
  await moveTo(to.x, to.y, true)
  const label = await until(
    'the drop label',
    `(() => { const t = ${outline}?.querySelector('[data-drop-label]')?.textContent ?? ''; return t.startsWith(${JSON.stringify(expect)}) ? t : null })()`,
  )
  console.error(`  ${label}`)
  await sleep(900)
  await mouse('mouseReleased', to.x, to.y, false)
  await showCursor(to.x, to.y, false)
  await until('the note', `!${shadow}.querySelector('.drop-note').hidden`)
  await sleep(500)
}

const pickTile = (kind) =>
  evaluate(`(() => {
    const card = [...${shadow}.querySelectorAll('[data-component]')].find((c) => c.dataset.component.endsWith('.${kind}'))
    if (!card) return null
    const tiles = [...card.querySelectorAll('[data-tile]')]
    const want = ${kind === 'Button' ? `['intent: primary', 'tone: primary', 'variant: primary']` : '[]'}
    const tile = tiles.find((t) => want.includes(t.dataset.tile)) ?? tiles[0]
    return tile ? '[data-component="' + card.dataset.component + '"] [data-tile="' + tile.dataset.tile + '"]' : null
  })()`)

try {
  console.error(`Starting hozu dev in ${app} on port ${PORT}…`)
  await waitFor(
    'hozu dev',
    async () => (await fetch(base, { signal: AbortSignal.timeout(2000) })).status < 500,
    90_000,
  ).catch((error) => {
    console.error(serverLog)
    throw error
  })

  browser = spawn(
    chrome,
    [
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      '--window-position=40,40',
      `${base}/`,
    ],
    { stdio: 'ignore' },
  )
  const port = await waitFor('Chrome', async () => {
    const file = join(profile, 'DevToolsActivePort')
    return existsSync(file) ? Number(readFileSync(file, 'utf8').split('\n')[0]) : null
  })
  const { webSocketDebuggerUrl: browserWs } = await waitFor('Chrome', async () =>
    (await fetch(`http://127.0.0.1:${port}/json/version`)).json(),
  )
  const target = await waitFor('the page', async () =>
    (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(
      (t) => t.type === 'page' && t.url.startsWith(base),
    ),
  )
  const top = new Cdp(browserWs)
  await top.open()
  await top
    .send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: base,
    })
    .catch(() => {})
  page = new Cdp(target.webSocketDebuggerUrl)
  await page.open()
  await page.send('Runtime.enable')
  await page.send('Page.enable')

  await until('DevTools', `!!${shadow}?.querySelector('.dock button')`, 30_000)
  await evaluate(
    `Object.keys(localStorage).filter((k) => k.startsWith('hozu-devtools')).forEach((k) => localStorage.removeItem(k))`,
  )
  await page.send('Page.reload')
  await sleep(500)
  await until('DevTools', `!!${shadow}?.querySelector('.dock button')`, 30_000)
  await cursor()
  await sleep(800)

  console.error('Open Assets')
  await click(await buttonIn('.dock button', 'Assets'))
  await until('the components', `!!${shadow}.querySelector('.assets:not([hidden]) [data-component]')`)
  await sleep(700)
  console.error('Dock it to the side')
  await click(await buttonIn('.assets-head button', 'Dock'))
  await sleep(900)

  const button = await pickTile('Button')
  if (!button) throw new Error('No Button component in Assets')
  console.error(`Drag ${button} after the main heading`)
  await drag(
    button,
    () =>
      until(
        'the main heading',
        `(() => { const h = document.querySelector('main h1') ?? document.querySelector('h1'); if (!h) return null; h.scrollIntoView({ block: 'center' }); const r = h.getBoundingClientRect(); return { x: r.x + Math.min(60, r.width / 2), y: r.bottom - Math.min(4, r.height / 8) } })()`,
      ),
    'Place after',
  )
  await type('A primary button that saves the draft')
  await sleep(600)
  await click(await buttonIn('.drop-note button', 'Add'))
  await until('the request item', `${shadow}.querySelectorAll('.panel .item').length === 1`)
  await until('the pending preview', `document.querySelectorAll('[data-hozu-pending]').length === 1`)
  console.error('  The page shows it, marked Pending #1')
  await sleep(2000)

  const badge = await pickTile('Badge')
  if (!badge) throw new Error('No Badge component in Assets')
  console.error(`Drag ${badge} before the list`)
  await drag(
    badge,
    () =>
      until(
        'a list',
        `(() => {
          const l = document.querySelector('main ul[data-hz], main ol[data-hz], [role="list"][data-hz], ul[data-hz], ol[data-hz]')
          if (!l) return null
          l.scrollIntoView({ block: 'center' })
          const r = l.getBoundingClientRect()
          const band = Math.max(1, Math.floor(r.height / 4) - 1)
          for (let dy = 1; dy < band; dy += 2)
            for (let x = r.x + 2; x < r.right; x += 6)
              if (document.elementFromPoint(x, r.y + dy)?.closest('[data-hz]') === l) return { x, y: r.y + dy }
          return { x: r.x + Math.min(80, r.width / 2), y: r.y + Math.min(3, r.height / 8) }
        })()`,
      ),
    'Place before',
  )
  await type('How many tasks are left')
  await sleep(600)
  await click(await buttonIn('.drop-note button', 'Add'))
  await until('two request items', `${shadow}.querySelectorAll('.panel .item').length === 2`)
  await until('the second preview', `document.querySelectorAll('[data-hozu-pending]').length === 2`)
  console.error('  The page shows it, marked Pending #2')
  await sleep(2000)

  console.error('Copy for AI')
  await click(await buttonIn('.actions button', 'Copy for AI'))
  await until('the copy', `!!${shadow}.querySelector('.status.ok, .status.err')`)
  let text = await evaluate('navigator.clipboard.readText().catch(() => "")').catch(() => '')
  if (!text) {
    const dir = join(app, '.hozu/requests')
    const latest = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => join(dir, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
    text = latest ? readFileSync(latest, 'utf8') : ''
  }
  console.log(text)
  console.error('Reload: the previews stay until the request is done')
  await page.send('Page.reload')
  await sleep(500)
  await until('DevTools', `!!${shadow}?.querySelector('.dock button')`, 30_000)
  await until('the previews', `document.querySelectorAll('[data-hozu-pending]').length === 2`)
  await cursor()
  await sleep(2500)
  await stop(0)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  await stop(1)
}
