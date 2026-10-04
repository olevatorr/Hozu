export const devClient = `const source = new EventSource('/_hozu/dev')
source.addEventListener('reload', () => {
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
