import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer } from '@hozu/adapter-node'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

interface Res {
  status: number
  headers: Record<string, unknown>
  body: string
}

const build = buildProject(project, { sources: false })
const styles = await compileStyles(build)
const server = createServer({
  build,
  styles,
  resolvers: createResolvers(),
  session: () => ({ userId: 'crawler' }),
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
const { port } = server.address() as AddressInfo
const call = (method: string, path: string) =>
  new Promise<Res>((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method, headers: { 'user-agent': 'Googlebot' } },
      (res) => {
        let body = ''
        res.on('data', (c) => {
          body += c
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })

const results: { page: string; check: string; ok: boolean; detail: string }[] = []
const check = (page: string, name: string, ok: boolean, detail = '') =>
  results.push({ page, check: name, ok, detail })
const first = (html: string, re: RegExp) => re.exec(html)?.[1] ?? null
const textOf = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

for (const path of ['/', '/posts/hello-hozu', '/posts/islands-explained']) {
  const res = await call('GET', path)
  const html = res.body
  const title = first(html, /<title>([^<]*)<\/title>/)
  check(
    path,
    'HTTP 200 + text/html',
    res.status === 200 && String(res.headers['content-type']).startsWith('text/html'),
    `${res.status}`,
  )
  check(
    path,
    'HEAD request answered',
    (await call('HEAD', path)).status === 200,
    `${(await call('HEAD', path)).status}`,
  )
  check(path, '<html lang>', /<html[^>]+lang=/.test(html))
  check(
    path,
    'meaningful <title> (10–60 chars, not the path)',
    !!title && title !== path && title.length >= 10 && title.length <= 60,
    JSON.stringify(title),
  )
  check(path, 'meta description', /<meta[^>]+name="description"/.test(html))
  check(path, 'meta viewport', /<meta[^>]+name="viewport"/.test(html))
  check(path, 'canonical link', /<link[^>]+rel="canonical"/.test(html))
  check(path, 'Open Graph tags', /<meta[^>]+property="og:/.test(html))
  check(path, 'JSON-LD structured data', /application\/ld\+json/.test(html))
  const h1 = html.match(/<h1\b/g)?.length ?? 0
  check(path, 'exactly one <h1>', h1 === 1, `${h1}`)
  check(
    path,
    'content present without JavaScript',
    textOf(html).length > 80,
    `${textOf(html).length} chars of text`,
  )
  const hrefs = [...html.matchAll(/<a[^>]+href="([^"]+)"/g)].map((m) => m[1]!)
  const broken: string[] = []
  for (const href of hrefs)
    if (href.startsWith('/') && (await call('GET', href)).status !== 200) broken.push(href)
  check(
    path,
    'internal links resolve',
    broken.length === 0,
    hrefs.length ? `${hrefs.length} links, broken: ${broken.join(', ') || 'none'}` : 'no links',
  )
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].filter(
    (m) => !/application\/(ld\+)?json|speculationrules/.test(m[1]!),
  ).length
  check(path, 'JavaScript shipped', true, scripts ? `${scripts} executable script tags` : '0 bytes')
  check(path, 'stylesheet linked in <head>', html.includes(`<link rel="stylesheet" href="${styles.href}">`))
  check(
    path,
    'canonical URL = site URL + path',
    html.includes(`<link rel="canonical" href="https://blog.hozu.dev${path}">`),
  )
  check(
    path,
    'user-specific content not in cacheable HTML',
    !(res.headers['x-hozu-cache'] !== 'bypass' && /reading list/i.test(html)),
    String(res.headers['x-hozu-cache']),
  )
}
const css = await call('GET', styles.href)
check(
  styles.href,
  'stylesheet served with an immutable cache',
  css.status === 200 &&
    String(css.headers['cache-control']).includes('immutable') &&
    css.body.includes('.prose'),
  `${(css.body.length / 1024).toFixed(1)} KB`,
)
const missing = await call('GET', '/posts/does-not-exist')
check(
  '/posts/does-not-exist',
  'unknown post → 404 (derived from getPost NotFound)',
  missing.status === 404,
  `${missing.status}`,
)
check(
  '/posts/does-not-exist',
  '404 page is noindex and has no canonical',
  missing.body.includes('content="noindex"') && !missing.body.includes('rel="canonical"'),
)
check('/nope', 'unknown route → 404', (await call('GET', '/nope')).status === 404)
const robots = await call('GET', '/robots.txt')
check(
  '/robots.txt',
  'robots.txt served with Sitemap line',
  robots.status === 200 && robots.body.includes('Sitemap: https://blog.hozu.dev/sitemap.xml'),
)
const sitemap = await call('GET', '/sitemap.xml')
const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
check(
  '/sitemap.xml',
  'sitemap lists every public page (entries expanded)',
  sitemap.status === 200 && locs.length === 3,
  locs.join(' '),
)
server.close()

const width = Math.max(...results.map((r) => r.check.length))
let page = ''
for (const r of results) {
  if (r.page !== page) {
    page = r.page
    console.log(`\n${page}`)
  }
  console.log(`  ${r.ok ? '✔' : '✖'} ${r.check.padEnd(width)}  ${r.detail}`)
}
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
