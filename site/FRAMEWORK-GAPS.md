# Framework gaps found while building hozu.org (0.9, rechecked on 0.25)

Each entry: approach → result → root cause. Nothing here is worked around silently. Found on 0.9; on 0.25 array props
still hold literals only (HZ014), an asset is still not a prop type, and the validator still rebuilds the previous
timers with `timers.includes(a.ms)`, so HZ018 still misses a changed duration.

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

## HZ018 cannot see a changed timer duration
- **Approach:** the lab's stage timer went from `after 700ms` to `after 2400ms`, and each Run contract was changed to
  expect the first stage after 2.3 s.
- **Result:** HZ018 on every guarded Run transition: "each passes against the previous behaviour too".
- **Root cause:** `previousFeature` (`packages/validator/src/contracts/verify.ts`) rebuilds the old target state with
  `target.after.filter((a) => timers.includes(a.ms))`. A changed duration matches no old value, so the rebuilt
  "previous" machine has no timer at all and never advances. A contract that holds a stage passes on it, so HZ018
  cannot tell the change apart. The site specifies the pace in a way the rebuild cannot satisfy (the second stage
  is reached at 2.5 s), and keeps the 2.3 s lower bound as a separate contract. The fix belongs in the validator:
  restore the old `ms` values instead of filtering.

## A translated message cannot sit in an array prop (0.26, the zh-TW site)
- **Approach:** `Display`, `Steps`, `StatTable` and `Ticker` took arrays of strings; the Chinese site passed
  `homeText.x` messages into them.
- **Result:** the same rule as the first entry: array props hold literals only, and a message is a reference.
- **Root cause:** as above. The site gave those components children (one item component per entry) and kept the array
  props for the English-only DevTools page, so each now has two ways to receive its items. Allowing references in
  array props would remove the second way.
