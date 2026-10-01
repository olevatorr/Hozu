# Framework gaps found while building hozu.org on 0.9

Each entry: approach → result → root cause. Nothing here is worked around silently.

## A list of internal links cannot be an array prop
- **Approach:** `Receipt` took `pay: [{ label, value, href }]` and the view filled `href` with `ui.link(trial, …)`.
- **Result:** HZ014 "Arrays may only contain literals", and TypeScript rejects `Href` for `z.string()` inside an array.
- **Root cause:** a `ui.link` value is a reference, not a literal, and array props hold literals only. A scalar prop
  takes it (`Button`'s `href`). The canonical form is one component per item (`ReceiptLine`) passed through slots.
