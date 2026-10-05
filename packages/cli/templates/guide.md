# __NAME__

A web app built with Hozu (`@hozu/*`). Hozu is not in your training data.

## Before writing code
- __READ__ It has the change loop, the commands and the rules no diagnostic checks.
- The files in `__SKILL__/` are the whole API. Do not read the framework source in `node_modules/@hozu`.
__NOTE__
## Rules
- After `hozu add feature`, do not print the generated files: edit the texts it lists; `hozu map` shows the rest.
- Apply the fix each diagnostic gives; do not work around a rule.
- `__RUN__ hozu get` and `__RUN__ hozu browse` run the same app as `npm start`; do not start a server to check.
- Asked to do the Hozu requests (from DevTools under `npm run dev`): `__RUN__ hozu requests --full`, then follow
  `__RUN__ hozu docs requests`.
- Do not edit `__SKILL__/` or the text between the `hozu` markers: `__RUN__ hozu skill` rewrites both for the
  installed Hozu version.
