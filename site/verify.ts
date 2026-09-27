import assert from 'node:assert/strict'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { buildProject } from '@hozu/core/ir'
import { testApp } from '@hozu/testing'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

const app = testApp({ build: buildProject(project), resolvers: createResolvers() })
for (const [path, status, text] of [
  ['/', 200, '72/72'],
  ['/docs/getting-started', 200, 'Create an app'],
  ['/trials/0012-correctness-notes', 200, '67/72'],
  ['/changelog', 200, '0.3.0'],
  ['/does-not-exist', 404, 'Page not found'],
  ['/docs/does-not-exist', 404, 'Page not found'],
  ['/trials/does-not-exist', 404, 'Page not found'],
] as const) {
  const response = await app.get(path)
  assert.equal(response.status, status, path)
  assert.ok(response.text.includes(text), `${path}: missing ${text}`)
  console.log(`${path}: ${status}, expected text present`)
}
const root = new URL('./dist/', import.meta.url)
assert.equal(await readFile(new URL('CNAME', root), 'utf8'), 'hozu.org\n')
assert.equal(await readFile(new URL('.nojekyll', root), 'utf8'), '')
assert.match(await readFile(new URL('404.html', root), 'utf8'), /Page not found/)
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'))
assert.equal(manifest.name, 'Hozu')
assert.match(manifest.icons[0].src, /^\/_hozu\/a\/[0-9a-f]{16}\.png$/)
const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8')
const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => new URL(match[1]!))
assert.ok(locations.length > 0)
for (const location of locations) {
  assert.equal(location.origin, 'https://hozu.org')
  assert.notEqual(location.pathname, '/404')
  await access(new URL(`.${location.pathname.replace(/\/$/, '')}/index.html`, root))
}
for (const [directory, prefix] of [
  [new URL('./content/docs/', import.meta.url), '/docs/'],
  [new URL('../docs/trials/', import.meta.url), '/trials/'],
] as const) {
  for (const name of await readdir(directory)) {
    if (name.endsWith('.md'))
      assert.ok(
        locations.some((url) => url.pathname === `${prefix}${name.slice(0, -3)}`),
        name,
      )
  }
}
const files = await readdir(root, { recursive: true })
let pages = 0
for (const file of files.filter((name) => name.endsWith('.html'))) {
  const html = await readFile(new URL(file, root), 'utf8')
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, `${file}: one main heading`)
  assert.ok(!/<script[^>]+src=/.test(html), `${file}: no client scripts`)
  assert.ok(!/role="alert"/.test(html), `${file}: no query failure alerts`)
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/hozu\.org\/_hozu\/a\/[0-9a-f]{16}\.png">/,
    `${file}: share image`,
  )
  for (const match of html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
    const url = new URL(match[1]!, `https://hozu.org/${file}`)
    if (url.origin !== 'https://hozu.org') continue
    const target = new URL(`.${url.pathname}`, root)
    const info = await stat(target)
    if (info.isDirectory()) await access(new URL(`${target.href.replace(/\/$/, '')}/index.html`))
  }
  pages++
}
console.log(
  `${pages} HTML files audited; ${locations.length} canonical sitemap URLs; all local links and assets resolve.`,
)
console.log('CNAME, .nojekyll, 404.html, static share image and source-content coverage verified.')
