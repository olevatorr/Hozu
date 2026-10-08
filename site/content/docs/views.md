---
title: Views
description: Describe accessible HTML with typed trees, explicit references and checked styles.
order: 3
---

## Start with a static view

A view describes a closed tree of HTML or SVG elements. This example needs no machine and ships no hydration code:

```ts
import { ui } from '@hozu/core'

export const Welcome = ui.view({
  render: () => ui.main({ class: 'mx-auto max-w-2xl px-6 py-12' }, [
    ui.h1({ class: 'text-4xl font-bold' }, ['Welcome']),
    ui.p({}, ['A page that is ready when the HTML arrives.']),
  ]),
})
```

Export `Welcome` from a module the feature lists in `declarations`, and list it in a page's `views`. Choose semantic elements, label inputs and give images useful alternative text.

## Render data

Use `ui.query` to read a declared query. Supply a `ready` tree, a pending tree or `null`, and handlers for the query's declared errors plus `Unexpected`.

Use `ui.each(items, 'id', item => ...)` for a list with stable keys. Use `null` as the key for a list of primitive values. To choose between trees, write `cond ? ui.p(…) : ui.ul(…)` or `cond && ui.p(…)`; use `ui.if(cond, yes, no, 'fade')` when the change should animate.

The callback records the tree once. JavaScript array operations on a constant list are fine; array operations on recorded query or context values need a declared `fn()`.

## Style the tree

Import Tailwind in the project's stylesheet and point `project({ styles })` at that file. The `class` attribute is a static string, and Hozu checks that each class produces CSS. Use `toggle` for guarded groups of classes and `vars` for CSS custom properties. There is no inline `style` attribute.

For your own CSS selectors, use `data-*` hooks. This keeps styling hooks distinct from checked utility classes.

## Reuse UI with components

A button, a field or a card used by several features is a component in a kit: `ui.component({ tag, styles, props, slots, events, render })`, listed in `ui.kit({ id: 'ui', components })` and `project({ kits })`, and used as `ui.use(Button, { variant, props, slots, on, class }, children)`. Variants are fixed looks written as literals; values that change at run time are props. A pure component is inlined when the view is recorded, so it adds no client JavaScript. [Components and kits](/docs/components) covers class overrides, client components and previews.

## Add interaction deliberately

Bind a view to a machine when it needs state and events. A button can send a declared event with `ui.send(Event, payload)`. DOM values such as `ui.dom.value`, `ui.dom.checked` and `ui.dom.form('title')` provide typed event fields.

Read a form's values with `ui.dom.form('title')`, so a submit made before the page has loaded still arrives: the server runs the same machine for that post. [Forms](/docs/forms) covers field errors, several values and multi-step forms.

A state with `invoke` drops every event it does not handle, so a repeated click cannot restart an in-flight operation. `is` reads the machine state anywhere a condition goes: `disabled: is(['saving'])`, `!is(['idle']) && ui.p({}, ['Saving…'])`. Keep a control and disable it while busy rather than hide it.

A mode the person sets, such as paused or a list or grid layout, is a context field, not a machine state, so a busy state keeps it: `ctx.paused ? resumeButton : pauseButton`. [Machines and contracts](/docs/machines) covers states, transitions and their contracts.

A control that only sets a context field needs no event: `on: { click: ui.set(ctx.open, !ctx.open) }` or `on: { input: ui.set(ctx.q, ui.dom.value) }`. The build adds the event and a transition that copies the value, exactly as if you wrote them.

A transition can also read the page's queries again, `refresh: () => [quotesTag()]` (a Refresh button, or every 30 seconds with `after` while a `live` state lasts), copy text to the clipboard, `copy: (e) => e.url`, and write the address without loading a page, `replace: () => ui.link(home, null, { q: ctx.q })`, so a reload or a shared link keeps a search.

Dialogs, popovers and menus need no machine state: `ui.button({ commandfor: 'd', command: 'show-modal' })` opens `ui.dialog({ id: 'd', closedby: 'any' }, [...])`, and `popover` / `popovertarget` and `ui.details` work the same way, also without JavaScript.

## Keyboard shortcuts

A shortcut presses a control, so `keys` goes on the control: a link, button, `summary` or field.

```ts
ui.input({ name: 'q', 'aria-label': 'Search', keys: ['/'] })
ui.button({ type: 'submit', keys: ['Mod+s'] }, ['Save'])
ui.button({ type: 'button', keys: ['Escape'], on: { click: ui.send(Dismiss, {}) } }, ['Close'])
```

- A press does what the control does: a field is focused (its text selected), anything else is clicked. A submit button submits its form, a link follows its address, a `commandfor` button opens its dialog. The machine sees the same event a click sends, so contracts are unchanged, and no machine is needed for a shortcut at all.
- `Mod` is ⌘ on Apple devices and Ctrl elsewhere; `Ctrl`, `Meta`, `Alt` and `Shift` name one key. The browser's own action for the press is stopped.
- Only visible, enabled controls count, and inside an open modal dialog only its own. A printable key without a modifier, such as `/`, waits while the person types in another field. `Escape` fires anyway; nothing fires while an input method composes text.
- The server writes `aria-keyshortcuts` (`Control+S Meta+S` for `Mod+s`), and a page with shortcuts loads a small module (about 0.7 KB) for them, islands or not.
- A key list Hozu cannot read, or two controls always shown together with one key, is HZ014. `hozu browse --do 'press Mod+s'` presses it.

## How updates land

The renderers follow from the view, so these need no code from you:

- When a query's input changes (a filter, one more item), the rows on screen stay, marked `aria-busy`, and only what changed is updated, matched by key. `pending` shows only before the first answer.
- What an update adds fades in (a region that was empty, rows added to a list); a swap does not fade, and nothing animates on the first render or with reduced motion. A `motion` name still chooses your own.
- A view that two pages show (a header, a side panel) stays still while the rest of the page cross-fades on a link.
- A machine that the next page shows too keeps its state across the page change (not on a reload), for the same visitor, with the fields the address sets taken from the address. State that belongs to one item, such as a draft on `/posts/:id`, is seeded from the address.
- `c ? a : b` whose branches are one element of the same tag and shape keeps that element: `ctx.paused ? resumeButton : pauseButton` updates the text, classes, attributes and listener, and focus stays on the button. Branches whose differing values compute (a `fn` call, a template string) or link to different routes are drawn anew.

`hozu browse` reports what to fix: a step that rebuilds elements unchanged, and layout that moves without input. See [Verify and test](/docs/testing).

## Menus, dialogs and counts
- A link to the address being shown gets `aria-current="page"`, on the server and in the browser. A menu marks its sections itself: the render's `current(route)` is true on that route's pages, so `'aria-current': current(orders) || current(orderDetail)` marks "Orders" on the list (`"page"` on the address itself), on a filtered list and on an order (`"true"`); `false` writes nothing. Style it with `aria-[current]:font-bold`.
- `current(shop, { category: 'apparel' })` also compares those params with the page shown and ignores the search. A param the route does not declare is HZ007.
- Write a menu as a constant list mapped to links, one line per entry; `current(a) || current(b)` works inside the `.map` too:

```ts
ui.nav({}, [
  ...['apparel', 'kitchen'].map((category) =>
    ui.a({ href: ui.link(shop, { category }), 'aria-current': current(shop, { category }) }, [category]),
  ),
])
```

- `ui.dialog({ open: is(['editing']), on: { close: ui.send(Cancel, {}) } }, [...])` opens as a modal when the machine enters `editing` and closes when it leaves; Escape sends the dialog's `close` event. It needs JavaScript: a dialog that must open without it uses the native `commandfor` button.
- `ui.format.plural(n, { one: '# item', other: '# items' })` chooses the case for the page's language. `null` and `false` render nothing, also inside a list built with `.map`.

## Images and Markdown

Use `ui.asset(new URL('./image.png', import.meta.url))` for local assets and provide image width and height. The optional image package can generate responsive WebP variants.

`ui.html(article.html)` renders trusted HTML, such as a repository-owned Markdown collection. It is not a sanitizer for visitor-provided content. Hozu reports untrusted values passed into raw HTML.

## Understand the design

Read [How Hozu works](/how-it-works/pipeline) for the decisions behind this API and their trade-offs.
