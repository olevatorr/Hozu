---
title: Components and kits
description: Share buttons, fields and cards between features, keep their look in one place, and wrap browser libraries.
order: 4
---

## Start a kit

A UI piece that several features use is a component in a kit. Two commands write the files and register them:

```sh
npx hozu add kit ui
npx hozu add component ui Button
```

`hozu add kit ui` writes `ui/kit.ts`, `ui/tv.ts` (the `tv()` function with the tailwind-merge config for your design system) and adds the kit to `project({ kits })`. `hozu add component notes Composer` makes a component private to one feature instead, listed in that feature's `declarations`. A stale `tv.ts` is HZ078; `hozu add kit ui --sync` regenerates its config.

## Declare a component

```ts
// ui/button.ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'inline-flex items-center gap-2 rounded px-4 py-2 font-medium disabled:opacity-50',
  variants: {
    tone: { primary: 'bg-indigo-600 text-white hover:bg-indigo-700', quiet: 'text-slate-600 hover:text-slate-900' },
  },
  defaultVariants: { tone: 'primary' },
})

export const Button = ui.component({
  tag: 'button',
  styles,
  props: z.object({ type: z.enum(['button', 'submit']).default('button'), disabled: z.boolean().default(false) }),
  children: true,
  events: ['press'],
  render: ({ props, children, on }) =>
    ui.button({ type: props.type, disabled: props.disabled, on: { click: on.press } }, children),
})
```

```ts
// ui/kit.ts
import { ui } from '@hozu/core'
import * as button from './button.ts'

export const kit = ui.kit({ id: 'ui', components: [button] })
```

Its id is `ui.Button`. The render is closed: it reads only `props`, `slots`, `children`, `on` and `classes` (the other slots of `tv()`), and Hozu puts the root class on the root element. A render that names an event, a query, a route or a message is HZ070: the caller passes sends, links and text in.

## Use it

`ui.use` is the only way to call a component:

```ts
ui.use(Button, { variant: { tone: 'quiet' }, props: { disabled: is(['saving']) }, on: { press: ui.send(Save, {}) }, class: 'w-full' }, ['Save'])
```

- **`variant`** chooses a fixed look and takes literals only (HZ071). Anything that changes while the page runs is a **prop**.
- **`slots`** fill named places, `on` handles the component's `events`, and children are allowed only with `children: true`.
- Style a state through the attribute that announces it (`disabled:`, `aria-pressed:`, `aria-busy:`, `aria-invalid:`, `open:`); `toggle` is for states without one.
- A pure component is inlined when the view is recorded: it adds no JavaScript, and the page's IR equals the inline form.

## Change its look from outside

A caller's `class` may add classes that set none of the component's properties, such as `w-full`, `relative` or `md:hidden`. The checks read which CSS properties each class sets:

| Code | Meaning |
| --- | --- |
| HZ072 | The caller's `class` sets a property the component owns: declare a variant. |
| HZ073, HZ074 | `!` used inside a component, or written in front (`!x`). |
| HZ075 | An inherited class (a colour, a font) that an inner element hides. |
| HZ076 | A component owns a margin: leave spacing to the caller. |
| HZ077 | `!` on a property the component does not own. |
| HZ079 | Two classes of one element set the same property. |
| HZ080 | A `part()` view inlined by two features: make it a component. |

A one-off change ends with `!` (`rounded-lg!`). `hozu check` counts the `!` overrides per component, so frequent ones show where a variant is missing. `extend: false` refuses every caller class.

## Browser code: client components

A map, a chart or an editor needs browser APIs. Give the component a `client` module and when to `load` it (`'eager'`, `'visible'` or `'idle'`), and declare what it `emits`:

```ts
export const Map = ui.component({
  tag: 'div',
  props: z.object({ lat: z.number(), lng: z.number() }),
  emits: { picked: z.object({ id: z.string() }) },
  client: new URL('./map.client.ts', import.meta.url),
  load: 'visible',
  render: () => ui.div({}, []),
})
```

```ts
// map.client.ts
import { implement } from '@hozu/core/component'
import type { Map } from './components.ts'

export default implement<typeof Map>(({ el, props, emit }) => {
  const map = createMap(el, props)
  map.on('pick', (id) => emit('picked', { id }))
  return { update: (next) => map.move(next), destroy: () => map.remove() }
})
```

- Import the declaration as a type only. The render is the server HTML the module takes over; with `children: true` the children stay as the fallback without JavaScript.
- `app.ts` passes `components: bundleComponents` from `@hozu/bundle` to `app()` (HZ045 without it); a missing module, or a handler for an event it does not emit, is HZ029.
- `hozu add component ui Map --client` writes the declaration, the module, the bundle in `app.ts` and the dependency.
- `hozu browse` lists each client component as mounted, failed or not mounted, with its size.

## Look them up

- `npx hozu docs components` prints the topic, then every component of the app with its tag and variants.
- `npx hozu render ui.Button --variant tone=quiet --props '{"disabled":true}'` renders one alone: its HTML, root class, owned properties and diagnostics.
- `npx hozu inspect ui.Button` and `npx hozu why ui.Button` list its variants, props and every use.

## Previews are for people

`previews.ts`, named by `project({ previews })`, holds component states and page screens with chosen data for [Hozu DevTools](/docs/devtools) Assets. It never ships: only `hozu dev` and `hozu check` load it, and HZ092 reports a preview that no longer fits the app. Agents change it only when asked.
