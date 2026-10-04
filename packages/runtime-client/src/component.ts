import type { Json } from '@hozu/core/ir'
import type { ComponentRef, ComponentRenderer, ComponentSetup } from './mount.ts'

export interface ComponentHost {
  el: HTMLElement
  ref: ComponentRef
  name: string
  doc: Document
  props(): Json
  emit(name: string, detail: unknown): void
  load(url: string): Promise<ComponentSetup>
  watch(update: () => void): void
  own(stop: () => void): void
  same(a: Json, b: Json): boolean
}

export function mountComponent(h: ComponentHost) {
  const controller = new AbortController()
  h.el.setAttribute('data-hozu-component', h.name)
  h.el.setAttribute('data-hozu-component-state', 'loading')
  let props = h.props()
  let instance: ReturnType<ComponentSetup>
  const fail = (error: unknown) => {
    instance = undefined
    h.el.setAttribute('data-hozu-component-state', 'failed')
    h.doc.defaultView?.console.error(`Component ${h.name} failed`, error)
  }
  const start = () =>
    void h.load(h.ref.url).then((setup) => {
      if (controller.signal.aborted) return
      try {
        instance = setup({ el: h.el, props, emit: h.emit, signal: controller.signal }) ?? undefined
        h.el.setAttribute('data-hozu-component-state', 'mounted')
      } catch (error) {
        fail(error)
      }
    }, fail)
  const win = h.doc.defaultView as (Window & typeof globalThis) | null
  if (h.ref.load === 'eager' || !win) start()
  else if (h.ref.load === 'idle') (win.requestIdleCallback ?? win.setTimeout)(start)
  else if (!win.IntersectionObserver) start()
  else {
    const io = new win.IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      start()
    })
    io.observe(h.el)
    controller.signal.addEventListener('abort', () => io.disconnect())
  }
  h.watch(() => {
    const next = h.props()
    if (h.same(next, props)) return
    props = next
    try {
      instance?.update?.(next)
    } catch (error) {
      fail(error)
    }
  })
  h.own(() => {
    controller.abort()
    instance?.destroy?.()
  })
}

/** A client component use, built and claimed here so pages without one ship none of it (ADR 0057 A1). */
export const renderComponent: ComponentRenderer = (app, node, scope, c, block) => {
  const name = node.use.component
  const ref = app.options.components?.[name]
  const tag = ref?.tag ?? 'div'
  let el: HTMLElement
  const claimed = c.claim && c.next?.nodeType === 1 && (c.next as Element).localName === tag
  if (claimed) {
    el = c.next as HTMLElement
    c.next = el.nextSibling
  } else {
    el = app.doc.createElement(tag)
    if (globalThis.__HOZU_DEV__) el.setAttribute('data-hz', node.id)
    if (node.class) el.setAttribute('class', node.class)
    c.parent.insertBefore(el, c.next)
  }
  app.styling(el, node, scope, block)
  if (!claimed || node.children.length) {
    const inner = { parent: el, next: claimed ? el.firstChild : null, claim: claimed }
    for (const child of node.children) app.render(child, scope, inner, block, null)
  }
  if (!ref) console.error(`Hozu: component ${name} has no client code (bundleComponents)`)
  if (!ref || !app.options.loadComponent) return
  mountComponent({
    el,
    ref,
    name,
    doc: app.doc,
    props: () => app.value(node.props, scope),
    emit: (event, detail) => {
      const send = node.on[event]
      if (send)
        app.dispatch({
          type: 'event',
          event: send.event,
          payload: app.value(send.payload, scope, (f) => (f === 'detail' ? (detail as Json) : null)),
        })
    },
    load: app.options.loadComponent,
    watch: (update) => block.push(update),
    own: (stop) => app.own(el, stop),
    same: app.same,
  })
}
