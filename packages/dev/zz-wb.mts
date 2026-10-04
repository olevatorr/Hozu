import { createRequire } from 'node:module'
import { dev } from '@hozu/dev'

const { chromium } = createRequire('/Users/otischen/Developer/Tenon/site/package.json')('playwright-core')
const server = await dev({
  cwd: '/Users/otischen/Developer/Tenon/examples/studio',
  port: 4880,
  appPort: 4881,
  log: () => {},
})
const b = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()))
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(server.url + '/')
await page.evaluate(() =>
  localStorage.setItem('hozu-devtools:127.0.0.1:4880', JSON.stringify({ view: 'workbench' })),
)
await page.reload()
await page.waitForTimeout(3000)
console.log(
  await page.evaluate(() => {
    const f = document.querySelector('hozu-devtools')?.shadowRoot?.querySelector('iframe')
    return {
      f: !!f,
      src: f?.src,
      ready: f?.contentDocument?.documentElement?.hasAttribute('data-hozu-ready'),
      body: f?.contentDocument?.body?.innerText?.slice(0, 80),
    }
  }),
)
for (const fr of page.frames()) console.log('frame', fr.url())
await b.close()
await server.close()
