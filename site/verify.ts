import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { codes } from '@hozu/core/ir'
import { testApp } from '@hozu/testing'
import site from './app.ts'
import { catches, claims } from './features/content/claims.ts'

const app = testApp(site)
for (const [path, status, text] of [
  ['/', 200, 'Hozu checks it'],
  ['/', 200, 'Here is the receipt'],
  ['/', 200, 'AI CHANGE'],
  ['/trials/0019-0-7-write-less', 200, '1.38×'],
  ['/how-it-works', 200, 'Understand the design'],
  ['/how-it-works/why-ai-first', 200, 'Why AI-first?'],
  ['/how-it-works/pipeline', 200, 'One representation'],
  ['/how-it-works/machines-and-contracts', 200, 'HZ016'],
  ['/how-it-works/derived-rendering', 200, 'User scope'],
  ['/how-it-works/framework-owned-data', 200, 'shallow ref'],
  ['/how-it-works/trade-offs', 200, '1.66×'],
  ['/how-it-works/missing', 404, 'Page not found'],
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
const release = JSON.parse(await readFile(new URL('../packages/core/package.json', import.meta.url), 'utf8'))
const homePage = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8')
assert.ok(homePage.includes(`data-version="${release.version}"`), `header shows ${release.version}`)
console.log(`Header version ${release.version} equals packages/core`)
for (const c of claims) await access(new URL(`./dist/trials/${c.trial}/index.html`, import.meta.url))
for (const c of catches) assert.equal(codes[c.code]?.name, c.name, `${c.code} is ${c.name} in the registry`)
for (const c of claims)
  assert.ok(homePage.includes(`href="/trials/${c.trial}"`), `${c.id} links to its trial`)
console.log(
  `${claims.length} claims link to existing trials; ${catches.length} catch cards match the registry`,
)
const snapshot = JSON.parse(
  await readFile(new URL('./features/play/render-snapshot.json', import.meta.url), 'utf8'),
)
for (const intent of ['solid', 'outline'] as const) {
  const fresh = JSON.parse(
    execFileSync(
      'pnpm',
      [
        'exec',
        'hozu',
        'render',
        'site.Button',
        '--variant',
        `intent=${intent}`,
        '--props',
        '{"href":"#"}',
        '--json',
      ],
      { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8' },
    ),
  )
  assert.deepEqual(
    snapshot[intent],
    { html: fresh.html, class: fresh.class, owned: fresh.owned },
    `render snapshot ${intent} is current`,
  )
}
console.log('Playground render snapshot equals hozu render')
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
  [new URL('./content/how-it-works/', import.meta.url), '/how-it-works/'],
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
  const interactive = file === 'how-it-works/index.html'
  if (interactive) {
    assert.match(html, /<script type="module" src="\/_hozu\/client\.js">/, 'Overview loads its Hozu island')
    assert.ok(html.includes('Run example'), 'Pipeline interaction exported')
    assert.ok(html.includes('Machine binding'), 'Render-plan interaction exported')
  } else if (html.includes('<pre')) {
    assert.match(
      html,
      /<script type="module" src="\/_hozu\/client\.js">/,
      `${file}: code blocks get the copy widget`,
    )
    assert.ok(html.includes('site.CodeBlock'), `${file}: the copy widget is in the payload`)
  } else {
    assert.ok(!/<script[^>]+(?:src=|type="module")/.test(html), `${file}: no client scripts`)
    assert.ok(!/rel="modulepreload"/.test(html), `${file}: no hidden JavaScript preloads`)
  }
  if (file.startsWith('docs/') || (file.startsWith('how-it-works/') && file !== 'how-it-works/index.html')) {
    assert.ok(html.includes('aria-current="page"'), `${file}: active chapter`)
    assert.ok(html.includes('On this page'), `${file}: table of contents`)
    assert.ok(html.includes('Edit this page on GitHub'), `${file}: source edit link`)
  }
  assert.ok(!/role="alert"/.test(html), `${file}: no query failure alerts`)
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/hozu\.org\/_hozu\/a\/[0-9a-f]{16}\.png">/,
    `${file}: share image`,
  )
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = new URL(match[1]!, `https://hozu.org/${file}`)
    if (url.origin !== 'https://hozu.org') continue
    const target = new URL(`.${url.pathname}`, root)
    const info = await stat(target)
    const resolved = info.isDirectory() ? new URL(`${target.href.replace(/\/$/, '')}/index.html`) : target
    await access(resolved)
    if (url.hash && resolved.pathname.endsWith('.html')) {
      const targetHtml = await readFile(resolved, 'utf8')
      assert.ok(
        targetHtml.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),
        `${file}: missing anchor ${url.href}`,
      )
    }
  }
  pages++
}
console.log(
  `${pages} HTML files audited; ${locations.length} canonical sitemap URLs; all local links and assets resolve.`,
)
console.log('CNAME, .nojekyll, 404.html, static share image and source-content coverage verified.')

assert.ok(
  files.some((file) => file.endsWith('client.js')),
  'Interactive overview has its client runtime',
)
const islandFeatures: Record<string, string[]> = {
  'index.html': ['hero', 'play', 'content'],
  'how-it-works/index.html': ['lab'],
}
for (const file of files.filter((name) => name.endsWith('.html'))) {
  const html = await readFile(new URL(file, root), 'utf8')
  const payload = html.match(/<script type="application\/json" id="hozu-payload">(.*?)<\/script>/s)?.[1]
  const ids: string[] = payload ? JSON.parse(payload).ids : []
  const allowed = islandFeatures[file] ?? (html.includes('<pre') ? ['content'] : [])
  for (const id of ids) assert.ok(allowed.includes(id.split('.')[0]!), `${file}: unexpected island ${id}`)
  assert.ok(
    ids.length > 0 || !html.includes('/_hozu/client.js'),
    `${file}: client JavaScript without an island`,
  )
}
for (const id of ['"hero.Hero', '"play.Play']) assert.ok(homePage.includes(id), `home binds ${id.slice(1)}`)
const stylesheet = homePage.match(/href="(\/_hozu\/styles\.[0-9a-f]+\.css)"/)?.[1]
assert.ok(stylesheet, 'home links its stylesheet')
const css = await readFile(new URL(`.${stylesheet}`, root), 'utf8')
assert.match(
  css,
  /@media \(prefers-reduced-motion: ?reduce\)\{\*,:before,:after\{[^}]*animation-duration:\.01ms!important/,
  'reduced motion stops every animation',
)
for (const name of ['rise', 'ticker', 'turn'])
  assert.ok(css.includes(`@keyframes ${name}`), `keyframes ${name} shipped`)
console.log('Islands: home (hero, play), how-it-works (lab), CodeBlock on code pages; reduced motion covered')
