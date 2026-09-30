export const liveStream = (doc: Document) => (onTags: (tags: string[]) => void, tags: string[]) => {
  const Source = doc.defaultView?.EventSource
  if (!Source) return
  const url = new URL('live', import.meta.url)
  for (const t of new Set(tags)) url.searchParams.append('tag', t)
  new Source(url).addEventListener('message', (e) => onTags(JSON.parse((e as MessageEvent).data)))
}
