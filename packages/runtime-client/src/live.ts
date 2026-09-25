export const liveStream = (doc: Document) => (onTags: (tags: string[]) => void) => {
  const Source = doc.defaultView?.EventSource
  if (!Source) return
  new Source('/_tenon/live').addEventListener('message', (e) => onTags(JSON.parse((e as MessageEvent).data)))
}
