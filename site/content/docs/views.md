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

Register `Welcome` in a feature's declarations and list it in a page's `views`. Choose semantic elements, label inputs and give images useful alternative text.

## Render data

Use `ui.query` to read a declared query. Supply a `ready` tree, a pending tree or `null`, and handlers for the query's declared errors plus `Unexpected`.

Use `ui.each(items, 'id', item => ...)` for a list with stable keys. Use `null` as the key for a list of primitive values. To choose between trees, write `cond ? ui.p(…) : ui.ul(…)` or `cond && ui.p(…)`; use `ui.if(cond, yes, no, 'fade')` when the change should animate.

The callback records the tree once. JavaScript array operations on a constant list are fine; array operations on recorded query or context values need a declared `fn()`.

## Style the tree

Import Tailwind in the project's stylesheet and point `project({ styles })` at that file. The `class` attribute is a static string, and Hozu checks that each class produces CSS. Use `toggle` for guarded groups of classes and `vars` for CSS custom properties. There is no inline `style` attribute.

For your own CSS selectors, use `data-*` hooks. This keeps styling hooks distinct from checked utility classes.

## Add interaction deliberately

Bind a view to a machine when it needs state and events. A button can send a declared event with `ui.send(Event, payload)`. DOM values such as `ui.dom.value`, `ui.dom.checked` and `ui.dom.form('title')` provide typed event fields.

A form whose submit payload reads only named form fields, constants, context, route parameters or search parameters can also work without JavaScript. The server runs the same machine for the native form post.

A state with `invoke` drops every event it does not handle, so a repeated click cannot restart an in-flight operation.

## Images and Markdown

Use `ui.asset(new URL('./image.png', import.meta.url))` for local assets and provide image width and height. The optional image package can generate responsive WebP variants.

`ui.html(article.html)` renders trusted HTML, such as a repository-owned Markdown collection. It is not a sanitizer for visitor-provided content. Hozu reports untrusted values passed into raw HTML.

## Understand the design

Read [How Hozu works](/how-it-works/pipeline) for the decisions behind this API and their trade-offs.
