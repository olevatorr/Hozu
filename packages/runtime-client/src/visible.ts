const watched = new WeakSet<Document>()

export function watch(doc: Document) {
  const win = doc.defaultView
  if (!win?.IntersectionObserver || watched.has(doc)) return
  watched.add(doc)
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) e.target.dispatchEvent(new win.Event('visible'))
  })
  const scan = (root: Element | Document) => {
    if (root instanceof win.Element && root.hasAttribute('data-hozu-visible')) seen.observe(root)
    for (const el of root.querySelectorAll('[data-hozu-visible]')) seen.observe(el)
  }
  scan(doc)
  new win.MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) scan(n as Element)
  }).observe(doc.body, { childList: true, subtree: true })
}
