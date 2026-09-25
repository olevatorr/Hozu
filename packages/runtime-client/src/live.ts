export const liveStream = (doc: Document) => (onTags: (tags: string[]) => void) => {
  const Source = doc.defaultView?.EventSource
  if (!Source) return
  new Source(new URL('live', import.meta.url)).addEventListener('message', (e) =>
    onTags(JSON.parse((e as MessageEvent).data)),
  )
}
