import { type ProjectIR, publicPath } from '@hozu/core/ir'

const iconType = (href: string) =>
  href.endsWith('.svg')
    ? 'image/svg+xml'
    : href.endsWith('.png')
      ? 'image/png'
      : href.endsWith('.ico')
        ? 'image/x-icon'
        : undefined

export function webManifest(ir: ProjectIR): string | null {
  const site = ir.site
  if (!site) return null
  const type = site.icon ? iconType(site.icon) : undefined
  return JSON.stringify({
    name: site.name,
    short_name: site.name,
    start_url: publicPath(ir, '/'),
    scope: `${ir.http.basePath}/`,
    display: 'standalone',
    background_color: '#ffffff',
    ...(site.themeColor ? { theme_color: site.themeColor } : {}),
    icons: site.icon ? [{ src: site.icon, sizes: 'any', ...(type ? { type } : {}) }] : [],
  })
}

export function serviceWorker(ir: ProjectIR, version: string): string | null {
  const route = ir.site?.offline ? ir.routes[ir.site.offline] : null
  if (!route) return null
  const prefix = `${ir.http.basePath}/_hozu/`
  return `const CACHE = ${JSON.stringify(`hozu-${version}`)}
const OFFLINE = ${JSON.stringify(publicPath(ir, route.path))}
const IMMUTABLE = ${JSON.stringify(['a/', 'w/', 'styles.'].map((p) => prefix + p))}
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hozu-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})
self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)))
    return
  }
  if (!IMMUTABLE.some((p) => url.pathname.startsWith(p))) return
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request)
      if (hit) return hit
      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    }),
  )
})
`
}

export const serviceWorkerRegistration = (ir: ProjectIR): string =>
  `navigator.serviceWorker?.register(${JSON.stringify(`${ir.http.basePath}/sw.js`)}, { scope: ${JSON.stringify(`${ir.http.basePath}/`)} })\n`
