import type { PagePayload, Session } from './hydrate.ts'

export interface State {
  views: Map<string, Set<string>>
  soft: Record<string, string[]>
  routes: Record<string, string>
}

interface NavigateEvent extends Event {
  canIntercept: boolean
  hashChange: boolean
  downloadRequest: string | null
  formData: FormData | null
  navigationType: string
  destination: { url: string }
  intercept(options: { handler: () => Promise<void> }): void
}

const HEAD =
  'title,meta[name=description],meta[name=robots],link[rel=canonical],meta[property],script[type="application/ld+json"]'

const groups: Record<string, string> = { '?': '(?:/[^/]+)?', '+': '(?:/[^/]+)+', '*': '(?:/[^/]+)*' }

const patternOf = (path: string) => {
  let keys = 0
  const source = path
    .split(/(\/:[A-Za-z]\w*[?*+]?)/)
    .map((part, i) => {
      if (i % 2 === 0) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const mod = part.at(-1)!
      keys += mod === '+' || mod === '*' ? 1.01 : 1
      return groups[mod] ?? '/[^/]+'
    })
    .join('')
  return { pattern: new RegExp(`^${source.replace(/\/$/, '')}/?$`), keys }
}

export function routeOf(routes: Record<string, string>, pathname: string): string | null {
  let best: string | null = null
  let fewest = Infinity
  for (const [id, path] of Object.entries(routes)) {
    const { pattern, keys } = patternOf(path)
    if (keys < fewest && pattern.test(pathname)) {
      best = id
      fewest = keys
    }
  }
  return best
}

export function islandsIn(root: Node): { marker: Comment; view: string | null }[] {
  const found: { marker: Comment; view: string | null }[] = []
  const walker = (root.ownerDocument ?? (root as Document)).createTreeWalker(root, 128)
  let view: string | null = null
  while (walker.nextNode()) {
    const c = walker.currentNode as Comment
    if (c.data === 'i') found.push({ marker: c, view })
    else if (c.data.startsWith('v:')) view = c.data.slice(2)
    else if (c.data === '/v') view = null
  }
  return found
}

export function track(
  state: State,
  session: Session,
  payload: PagePayload,
  found: { view: string | null }[],
) {
  session.islands(payload).forEach((island, i) => {
    const view = found[i]?.view
    if (!view) return
    const owners = state.views.get(view) ?? new Set()
    owners.add(island.feature)
    state.views.set(view, owners)
  })
  state.soft = payload.soft ?? {}
  Object.assign(state.routes, payload.routes)
}

export function ranges(body: Node): Map<string, Node[]> {
  const out = new Map<string, Node[]>()
  let current: Node[] | null = null
  for (const n of [...body.childNodes]) {
    if (n.nodeType === 8 && (n as Comment).data.startsWith('v:')) {
      current = [n]
      out.set((n as Comment).data.slice(2), current)
    } else if (current) {
      current.push(n)
      if (n.nodeType === 8 && (n as Comment).data === '/v') current = null
    }
  }
  return out
}

export async function swap(session: Session, state: State, next: Document, kept: string[]): Promise<boolean> {
  const { doc, apps } = session
  const { views } = state
  const script = next.getElementById('tenon-payload')
  const fresh = ranges(next.body)
  const live = ranges(doc.body)
  if (!script?.textContent || kept.some((v) => !fresh.has(v) || !live.has(v))) return false
  const payload = JSON.parse(script.textContent) as PagePayload
  const keep = new Set(kept)
  const found = islandsIn(next.body)
  const needed = new Set<string>()
  for (const v of keep) for (const f of views.get(v) ?? []) needed.add(f)
  session.islands(payload).forEach((island, i) => {
    const view = found[i]?.view
    if (view === undefined || view === null || !keep.has(view)) needed.add(island.feature)
  })
  for (const [id, app] of apps)
    if (!needed.has(id)) {
      app.destroy()
      apps.delete(id)
    }
  for (const v of [...views.keys()]) if (!keep.has(v)) views.delete(v)
  const anchor = doc.getElementById('tenon-payload')
  let cursor = 0
  const order = [...live.keys()].filter((v) => keep.has(v))
  for (const [ref, nodes] of fresh) {
    if (keep.has(ref)) {
      cursor++
      continue
    }
    const before = order[cursor] ? live.get(order[cursor]!)![0]! : anchor
    for (const n of nodes) doc.body.insertBefore(n, before)
  }
  for (const [ref, nodes] of live) if (!keep.has(ref)) for (const n of nodes) (n as ChildNode).remove()
  if (anchor) anchor.textContent = script.textContent
  for (const el of doc.head.querySelectorAll(HEAD)) el.remove()
  for (const el of next.head.querySelectorAll(HEAD)) doc.head.append(el)
  doc.documentElement.lang = next.documentElement.lang
  await session.mount(
    payload,
    found.map((f) => (f.view !== null && keep.has(f.view) ? undefined : f.marker)),
  )
  track(state, session, payload, found)
  return true
}

export function soft(session: Session) {
  const { doc } = session
  const win = doc.defaultView as (Window & typeof globalThis & { navigation?: EventTarget }) | null
  const script = doc.getElementById('tenon-payload')
  if (!win?.navigation || !script?.textContent) return
  const state: State = { views: new Map(), soft: {}, routes: {} }
  track(state, session, JSON.parse(script.textContent) as PagePayload, islandsIn(doc.body))
  let announcer: HTMLElement | null = null
  let bypass = false
  const announce = (title: string) => {
    if (!announcer) {
      announcer = doc.createElement('div')
      announcer.setAttribute('aria-live', 'polite')
      announcer.style.cssText =
        'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'
      doc.body.append(announcer)
    }
    announcer.textContent = title
  }
  win.navigation.addEventListener('navigate', (event) => {
    const e = event as NavigateEvent
    if (bypass || !e.canIntercept || e.hashChange || e.downloadRequest !== null || e.formData) return
    if (e.navigationType === 'reload') return
    const url = new URL(e.destination.url)
    if (url.origin !== win.location.origin) return
    const target = routeOf(state.routes, url.pathname)
    const kept = target ? state.soft[target] : undefined
    if (!kept) return
    const hard = () => {
      bypass = true
      win.location.replace(url.href)
    }
    e.intercept({
      handler: async () => {
        const root = doc.documentElement
        root.setAttribute('data-tenon-navigating', '')
        try {
          const response = await win.fetch(url.href, { headers: { accept: 'text/html' } })
          const type = response.headers.get('content-type') ?? ''
          if (response.status !== 200 || response.redirected || !type.includes('text/html')) return hard()
          const next = new win.DOMParser().parseFromString(await response.text(), 'text/html')
          let ok = true
          const run = async () => {
            ok = await swap(session, state, next, kept)
          }
          const transition = (
            doc as Document & {
              startViewTransition?: (f: () => Promise<void>) => { updateCallbackDone: Promise<void> }
            }
          ).startViewTransition
          if (transition) await transition.call(doc, run).updateCallbackDone
          else await run()
          if (!ok) return hard()
          announce(doc.title)
        } catch {
          hard()
        } finally {
          root.removeAttribute('data-tenon-navigating')
        }
      },
    })
  })
}
