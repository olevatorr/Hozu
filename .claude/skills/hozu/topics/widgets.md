# Widgets (browser APIs, DOM libraries)

Start with `hozu add widget <feature> <Name>`: it writes the declaration, the client module, the `serve.ts` bundle
and the `@hozu/bundle` dependency. There is no `widget` export; the pieces are:
```ts
export const Map = ui.widget({ tag: 'div', props: z.object({ lat: z.number(), lng: z.number() }),
  events: { picked: z.object({ id: z.string() }) }, client: new URL('./map.client.ts', import.meta.url),
  load: 'visible', wraps: false })                                      // in declarations
ui.use(Map, { props: { lat: ctx.lat, lng: ctx.lng }, on: { picked: (d) => ui.send(Pick, { id: d.id }) },
  class: 'h-96 w-full' }, [])                                           // in a view
```
```ts
// map.client.ts: a type-only import of the declaration
import { implement } from '@hozu/core/widget'
import type { Map } from './widgets.ts'
export default implement<typeof Map>(({ el, props, emit, signal }) => {
  const map = createMap(el, props)                          // any DOM library
  map.on('pick', (id) => emit('picked', { id }))
  return { update(next) { map.move(next) }, destroy() { map.remove() } }
})
```
- `load`: `'eager' | 'visible' | 'idle'`; `wraps: true` keeps the children as server HTML.
- `serve.ts` passes `widgets: await bundleWidgets(build)` (the server refuses to start without it; `hozu build` bundles
  them itself). A library's CSS goes in `app.css` (`@import "leaflet/dist/leaflet.css";`); a map or chart host needs a
  height class.
- Check it with `hozu browse /` (no server): each widget is listed as mounted / failed / not mounted with its size
  and canvases, next to any error it threw. A mounted host carries `data-hozu-widget="<feature>.<Name>"` and
  `data-hozu-widget-state="mounted"` for your own browser tests.
