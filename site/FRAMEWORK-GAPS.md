# Framework gaps found while building hozu.org on 0.9

Each entry: approach → result → root cause. Nothing here is worked around silently.

## A list of internal links cannot be an array prop
- **Approach:** `Receipt` took `pay: [{ label, value, href }]` and the view filled `href` with `ui.link(trial, …)`.
- **Result:** HZ014 "Arrays may only contain literals", and TypeScript rejects `Href` for `z.string()` inside an array.
- **Root cause:** a `ui.link` value is a reference, not a literal, and array props hold literals only. A scalar prop
  takes it (`Button`'s `href`). The canonical form is one component per item (`ReceiptLine`) passed through slots.

## A page cannot wrap views of two machines in one landmark
- **Approach:** the home page listed `[Header, Hero, Home, Play, LabTeaser, Evidence, Footer]`, with `Hero` and `Play`
  each bound to its own machine.
- **Result:** no view could render a `<main>` around the others, so the home page had no main landmark (review I4).
- **Root cause:** a page composes views side by side and each view is one root. A landmark that spans several views,
  or two machines in one view, is not expressible. The canonical form is one machine per page view: `home` merges the
  demo's `Break`/`Fix` and the playground's machine-wide `Pick`, and its one view renders `<main>` around sections
  01–08.

## An asset cannot be a component prop
- **Approach:** `Joint` took `model` and `poster` as `z.string()` props, filled with `ui.asset(…)` in the home view.
- **Result:** TS2322, `Asset` is not assignable to `string`.
- **Root cause:** `ui.asset` is an attribute value (`AttrValue`), not data. The component now owns its assets: the
  render uses module constants for `src` and `data-model`, and the client module reads the model URL from the DOM.
  A component reused with different models would need a prop type for assets.
