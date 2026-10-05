export const devClient = `const source = new EventSource('/_hozu/dev')
try {
  const why = sessionStorage.getItem('hozu:dev-reload')
  if (why) console.info('[hozu dev] reloaded: ' + why + ' changed')
  sessionStorage.removeItem('hozu:dev-reload')
} catch {}
source.addEventListener('reload', (event) => {
  try {
    sessionStorage.setItem('hozu:dev-reload', (JSON.parse(event.data).files ?? []).join(', '))
  } catch {}
  window.__hozu?.save()
  location.reload()
})
source.addEventListener('notes', () => dispatchEvent(new Event('hozu:notes')))
source.addEventListener('css', async () => {
  const html = await (await fetch(location.href, { headers: { accept: 'text/html' } })).text()
  const next = new DOMParser().parseFromString(html, 'text/html')
  const fresh = [...next.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'))
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
  links.forEach((link, i) => {
    const href = fresh[i]
    if (href && link.getAttribute('href') !== href) link.setAttribute('href', href)
  })
})
`
