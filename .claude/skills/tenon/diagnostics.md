# Tenon diagnostics

Every diagnostic carries `file:line`, a cause and a fix, and often a snippet or patch. Apply the fix; do not work
around the rule.

| Code | Meaning | Usual fix |
|---|---|---|
| TN001 | state unreachable | add a transition to it or delete it |
| TN002 | event handled nowhere | handle it in a state or remove it |
| TN003 / TN007 | unknown effect / reference | declare it, or fix the name (the patch suggests one) |
| TN004 | a declared error is not handled | add every `failed` key, plus `Unexpected`, in `invoke` and `ui.query` |
| TN005 | a node sends an event in a state that does not handle it | `ignore: [Event]` in that state, or show the node only via `when` |
| TN006 | crossing a feature boundary | import the feature and use its `exports` |
| TN008 | a path does not exist in the schema | fix the property name |
| TN009 | a guardless transition shadows later ones | put guarded transitions first |
| TN014 | wrong builder output | follow the builder signature |
| TN015 / TN017 | a contract fails / contract data does not match its schema | fix the machine or the contract (decide the intended behaviour first) |
| TN016 | a transition without a contract | add the contract from the snippet |
| TN018 | behaviour changed without a contract change | update the contracts, then `--update-lock` |
| TN021 | a query or mutation without a resolver | `implement(...)` it in server.ts |
| TN022 | user data in a cacheable region | keep `scope: 'user'` queries out of cached pages |
| TN024 / TN025 | route params mismatch / page with params but no `entries` | align them / add `entries` |
| TN026 | a class produces no CSS | fix the Tailwind class |
| TN027 | a DOM field used outside an event, or wrong for this event | read `ui.dom.*` only in `ui.send` payloads |
| TN028 | `img` without width/height | add both |
| TN030 | `ui.html` of untrusted data | render text instead |
| TN031 | a literal not allowed by its schema | use an allowed value (the patch suggests one) |
| TN032 | internal link written as a string | `ui.link(route, params)` |
| TN033 | DOM text into an enum, number or boolean field | a `<select>` with enum options / `valueAsNumber` / `checked` |
| TN034 | a state both handles and ignores an event | remove it from one of the two |
| TN035 | search schema is not a flat object of scalars with defaults | `z.object({ key: scalar.default(…) })` |
| TN036 | (warning) a form needs JavaScript | read its values with `ui.dom.form('name')` |
| TN037 | a redirect is not a path, hides a page or another redirect, or targets an unknown route | change or remove the `from` key; point `to` at `ui.link(...)` |
| TN038 | `http.headers` sets a header the framework owns, or an invalid name/value | remove it (`cache-control` is derived; CSP is `createServer({ csp })`) |
| TN039 | `basePath` is not `''` or `/segment[/segment…]` | e.g. `'/shop'`, no trailing slash |
