import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { codes } from '@hozu/core/ir'
import { testApp } from '@hozu/testing'
import site from './app.ts'
import { catches, claims } from './features/content/claims.ts'

const app = testApp(site)
for (const [path, status, text] of [
  ['/', 200, 'Hozu checks it'],
  ['/', 200, 'Here is the receipt'],
  ['/', 200, 'AI CHANGE'],
  ['/', 200, 'Three minutes. No code.'],
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
  ['/does-not-exist', 404, 'Nothing fits here'],
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
const devtoolsPage = await readFile(new URL('./dist/devtools/index.html', import.meta.url), 'utf8')
const film = /<video[^>]*preload="none"[^>]*><source src="(\/_hozu\/a\/[0-9a-f]+\.mp4)" type="video\/mp4">/
for (const [page, html] of [
  ['/', homePage],
  ['/devtools', devtoolsPage],
] as const) {
  const src = film.exec(html)?.[1]
  assert.ok(src, `${page}: a film that does not preload`)
  const { size } = await stat(new URL(`./dist${src}`, import.meta.url))
  assert.ok(size <= 8_000_000, `${page}: the film is ${size} B, over 8 MB`)
}
assert.ok(homePage.includes('alt="Peg, the red peg that checks, smiling"'), 'Peg in the hero demo')
console.log('Peg and the two films are on the home and DevTools pages; no film preloads, each under 8 MB')
for (const c of claims) await access(new URL(`./dist/trials/${c.trial}/index.html`, import.meta.url))
for (const c of catches) assert.equal(codes[c.code]?.name, c.name, `${c.code} is ${c.name} in the registry`)
for (const c of claims) {
  const shown = [...homePage.matchAll(new RegExp(`<a[^>]*data-claim="${c.id}"[^>]*>(.*?)</a>`, 'gs'))]
  assert.ok(shown.length > 0, `${c.id} is shown on the home page`)
  for (const [element, inner] of shown) {
    assert.ok(element.includes(`href="/trials/${c.trial}"`), `${c.id} links to ${c.trial}`)
    assert.ok(inner!.includes(c.value), `${c.id} shows ${c.value}`)
  }
}
const visible = homePage
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<pre[\s\S]*?<\/pre>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
const numbers = visible.match(/\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?×|\d+\/\d+|\d+(?:\.\d+)? KB/g) ?? []
for (const n of numbers)
  assert.ok(
    claims.some((c) => c.value.includes(n)),
    `home number ${n} comes from claims.ts`,
  )
console.log(
  `${claims.length} claims link to existing trials; ${catches.length} catch cards match the registry`,
)
const snapshot = JSON.parse(
  await readFile(new URL('./features/home/render-snapshot.json', import.meta.url), 'utf8'),
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
const glb = await readFile(new URL('./assets/joint.glb', import.meta.url))
assert.equal(glb.toString('ascii', 0, 4), 'glTF', 'joint.glb is binary glTF')
const gltf = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)))
for (const name of ['split', 'join'])
  assert.ok(
    gltf.animations?.some((a: { name: string }) => a.name === name),
    `joint.glb has the ${name} action`,
  )
for (const name of ['beam', 'post-l', 'post-r', 'peg-l', 'peg-r'])
  assert.ok(
    gltf.nodes.some((n: { name: string }) => n.name === name),
    `joint.glb has the ${name} node`,
  )
console.log(`joint.glb: ${glb.length} bytes, actions split and join, ${gltf.nodes.length} nodes`)
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
  assert.equal((html.match(/<main[ >]/g) ?? []).length, 1, `${file}: one main landmark`)
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
  'index.html': ['home'],
  'how-it-works/index.html': ['lab'],
  'devtools/index.html': ['home'],
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
for (const id of ['"home.Home']) assert.ok(homePage.includes(id), `home binds ${id.slice(1)}`)
const stylesheet = homePage.match(/href="(\/_hozu\/styles\.[0-9a-f]+\.css)"/)?.[1]
assert.ok(stylesheet, 'home links its stylesheet')
const css = await readFile(new URL(`.${stylesheet}`, root), 'utf8')
assert.match(
  css,
  /@media \(prefers-reduced-motion: ?reduce\)\{\*,:before,:after\{[^}]*animation-duration:\.01ms!important/,
  'reduced motion stops every animation',
)
for (const name of ['rise', 'ticker', 'nudge'])
  assert.ok(css.includes(`@keyframes ${name}`), `keyframes ${name} shipped`)
const jointBundle = homePage.match(/\/_hozu\/c\/site-Joint-[A-Z0-9]+\.js/)?.[0]
assert.ok(jointBundle, 'the home page references the joint bundle')
const jointBytes = gzipSync(await readFile(new URL(`.${jointBundle}`, root))).length
assert.ok(jointBytes <= 180 * 1024, `joint bundle is ${jointBytes} B gzip, limit 180 KB`)
for (const file of files.filter((name) => name.endsWith('.html') && name !== 'index.html'))
  assert.ok(
    !(await readFile(new URL(file, root), 'utf8')).includes('site-Joint-'),
    `${file}: no joint bundle`,
  )
assert.ok(homePage.includes('<meta name="theme-color" content="#f1ede4">'), 'theme-color is the page paper')
assert.match(css, /html\{[^}]*background:var\(--color-paper\)/, 'the html root has the paper background')
console.log(`Joint bundle ${(jointBytes / 1024).toFixed(1)} KB gzip (limit 180), home page only`)
console.log(
  'Islands: home (home), how-it-works (lab), devtools (its CodeBlock), CodeBlock on code pages; reduced motion covered',
)
