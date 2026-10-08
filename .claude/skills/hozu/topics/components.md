# Components (shared UI, kits, browser code)

A UI piece used by several features is a component in a kit: `hozu add kit ui`, then `hozu add component ui Button`
(`hozu add component <feature> <Name>` makes one private to that feature).
```ts
// ui/button.ts; ui/kit.ts lists it: ui.kit({ id: 'ui', components: [button, input] })
const styles = tv({                                            // tv from ./tv.ts
  base: 'inline-flex gap-2 rounded px-4 py-2 disabled:opacity-50 aria-busy:cursor-wait',
  variants: { tone: { primary: 'bg-indigo-600 text-white', ghost: 'text-slate-700 hover:bg-slate-100' } },
  defaultVariants: { tone: 'primary' },
})
export const Button = ui.component({
  tag: 'button', styles, slots: ['icon'], children: true, events: ['press'],
  props: z.object({ type: z.enum(['button', 'submit']).default('button'), busy: z.boolean().default(false) }),
  render: ({ props, slots, children, on }) =>
    ui.button({ type: props.type, 'aria-busy': props.busy, on: { click: on.press } }, [slots.icon, ...children]),
})
```
```ts
ui.use(Button, { variant: { tone: 'ghost' }, props: { busy: ctx.saving }, slots: { icon: ui.span({}, ['+']) },
  on: { press: ui.send(Save, {}) }, class: 'w-full' }, ['Save'])           // in a view; its id is ui.Button
```
- **`ui.use` keys** (all optional): `variant` (literals only, HZ071), `props` (what changes at run time), `slots`,
  `on`, `class`, `keys` (a control root); children only with `children: true`.
- **Render** reads only `props`, `slots`, `children`, `on` and `classes`; the caller passes sends, links and text
  in (HZ070).
- **`class`** may only add classes that set none of the component's properties (`w-full`, `md:hidden`); to change
  one, declare a variant (HZ072–HZ077; one-offs: see --more).
- Browser APIs or DOM libraries: a client component, `hozu add component <kit|feature> <Name> --client` (see --more).
- `previews.ts` (`project({ previews })`) is for people: named component states and page screens in DevTools
  Assets. It never ships; change it only when asked or when HZ092 names a line (see --more).

<!-- more -->

## Details
- `hozu add kit ui` writes `ui/kit.ts`, `ui/tv.ts` and `project({ kits })`.
- **Variants vs props:** a variant is a fixed look chosen in the view (HZ071 for data); anything that changes while
  the page runs is a prop. Style a state through the attribute that announces it: `disabled:`, `aria-pressed:`,
  `aria-busy:`, `aria-invalid:`, `aria-expanded:`, `open:`. `toggle` is for states without one.
- **Render:** `classes` holds the other tv slots (`classes.label`). Hozu puts the root class on the root.
- **Extension:** `class` may add classes that set none of the component's properties (`w-full`, `relative`,
  `md:hidden`). To change one, declare a variant; a one-off ends with `!` (`rounded-lg!`) (HZ072–HZ077).
  `hozu check` counts the `!` per component; `extend: false` refuses every class.
- A view fragment that two features inline is a component, not a `part()` (HZ080).

## Client components (browser APIs, DOM libraries)
`hozu add component <kit|feature> <Name> --client` writes the declaration, the client module, the bundle in `app.ts`
and the `@hozu/bundle` dependency.
```ts
export const Map = ui.component({ tag: 'div', props: z.object({ lat: z.number(), lng: z.number() }),
  emits: { picked: z.object({ id: z.string() }) }, client: new URL('./map.client.ts', import.meta.url),
  load: 'visible', render: () => ui.div({}, []) })                     // 'eager' | 'visible' | 'idle'
ui.use(Map, { props: { lat: ctx.lat, lng: ctx.lng }, on: { picked: (d) => ui.send(Pick, { id: d.id }) },
  class: 'h-96 w-full' })
```
```ts
// map.client.ts: a type-only import of the declaration
import { implement } from '@hozu/core/component'
import type { Map } from './components.ts'
export default implement<typeof Map>(({ el, props, emit, signal }) => {
  const map = createMap(el, props)                          // any DOM library
  map.on('pick', (id) => emit('picked', { id }))
  return { update(next) { map.move(next) }, destroy() { map.remove() } }
})
```
- The render is the server HTML the module takes over; with `children: true` the children stay as the no-JS
  fallback. The root takes no attributes or `on`: put a role or label on a wrapping element.
- `app.ts` passes `components: bundleComponents` (`@hozu/bundle`) to `app()` (HZ045 without it). A library's CSS
  goes in `app.css`; a map or chart host needs a height class.
- `hozu browse /` lists each one as mounted / failed / not mounted with its size and canvases; a mounted host has
  `data-hozu-component="<id>"` and `data-hozu-component-state="mounted"`.

## Look them up
- `hozu docs components` (this topic, then the app's list), `hozu inspect ui.Button` (variants, props, owned
  classes, every use), `hozu why ui.Button`.
- `hozu render ui.Button --variant tone=ghost --props '{"busy":true}' --slot icon=+` renders it alone: HTML, root
  class, owned properties, diagnostics.

## Previews (for people, never shipped)
- `project({ previews: new URL('./previews.ts', import.meta.url) })`; only `hozu dev` and `hozu check` load it. DevTools **Assets** shows every component × variant (props from the schema) plus these.
- ```ts
  import { previews } from '@hozu/core/preview'
  export default previews((p) => [
    p.component(Button, 'Long label', { variant: { tone: 'primary' }, children: 'Save every note' }),
    p.page(home, 'No notes', [p.data(me, { name: 'ada' }), p.data(listNotes, [])]),
    p.page(home, 'Failed', [p.fail(listNotes, 'Unexpected')]),
  ])
  ```
- A page preview answers those queries under `hozu dev` only (Layers → Previews, or Assets → Screens), on every
  page while it is on; other queries and mutations run as usual. HZ092: data off the output schema, an undeclared error, a route without a page, a use that
  does not build.

