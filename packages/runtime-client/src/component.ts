import type { Json } from '@hozu/core/ir'
import type { ComponentRef, ComponentSetup } from './mount.ts'

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
