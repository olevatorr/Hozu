const seconds = (list: string) =>
  list.split(',').map((s) => Number.parseFloat(s) * (s.trim().endsWith('ms') ? 1 : 1000) || 0)

function duration(el: Element): number {
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (!cs) return 0
  const longest = (d: string, delay: string) => {
    const a = seconds(d)
    const b = seconds(delay)
    return Math.max(0, ...a.map((x, i) => x + (b[i % b.length] ?? 0)))
  }
  return Math.max(
    longest(cs.transitionDuration, cs.transitionDelay),
    longest(cs.animationDuration, cs.animationDelay),
  )
}

const frame = (el: Element, run: () => void) => {
  const win = el.ownerDocument.defaultView
  if (!win?.requestAnimationFrame) return run()
  win.requestAnimationFrame(() => win.requestAnimationFrame(run))
}

function after(el: Element, run: () => void) {
  const ms = duration(el)
  if (ms === 0) return run()
  let done = false
  const finish = () => {
    if (done) return
    done = true
    el.removeEventListener('transitionend', finish)
    el.removeEventListener('animationend', finish)
    run()
  }
  el.addEventListener('transitionend', finish)
  el.addEventListener('animationend', finish)
  setTimeout(finish, ms + 50)
}

export const reduced = (doc: Document) =>
  doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

function phase(el: Element, name: string, stage: 'enter' | 'leave', done: () => void) {
  const from = `${name}-${stage}-from`
  const active = `${name}-${stage}-active`
  const to = `${name}-${stage}-to`
  el.classList.add(from, active)
  frame(el, () => {
    el.classList.remove(from)
    el.classList.add(to)
    after(el, () => {
      el.classList.remove(active, to)
      done()
    })
  })
}

export function enter(nodes: Node[], name: string) {
  for (const n of nodes) if (n.nodeType === 1) phase(n as Element, name, 'enter', () => {})
}

export function leave(nodes: Node[], name: string) {
  for (const n of nodes)
    if (n.nodeType === 1) phase(n as Element, name, 'leave', () => (n as ChildNode).remove())
    else (n as ChildNode).remove()
}

export function flip(el: HTMLElement, before: DOMRect, name: string) {
  const now = el.getBoundingClientRect()
  const dx = before.left - now.left
  const dy = before.top - now.top
  if (!dx && !dy) return
  const style = el.style
  style.transitionDuration = '0s'
  style.transform = `translate(${dx}px, ${dy}px)`
  void el.offsetWidth
  el.classList.add(`${name}-move`)
  style.transitionDuration = ''
  style.transform = ''
  after(el, () => el.classList.remove(`${name}-move`))
}

/** A keyed list's motion: rects before the update, then enter, leave and move after it (ADR 0057 A1). */
export function track(firsts: Node[], name: string) {
  const rects = new Map(
    firsts.flatMap((n) => (n.nodeType === 1 ? [[n, (n as Element).getBoundingClientRect()] as const] : [])),
  )
  return {
    leave: (nodes: Node[]) => leave(nodes, name),
    settle(items: [nodes: Node[], fresh: boolean][]) {
      for (const [nodes, fresh] of items) {
        const before = rects.get(nodes[0]!)
        if (fresh) enter(nodes, name)
        else if (before) flip(nodes[0] as HTMLElement, before, name)
      }
    },
  }
}
