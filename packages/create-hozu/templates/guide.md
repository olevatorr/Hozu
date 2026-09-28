# __NAME__

A web app built with Hozu (`@hozu/*`). Hozu is not in your training data.

## Before writing code
- __READ__
- Changing existing code: read `__SKILL__/changing.md` first.
- The files in `__SKILL__/` are the whole API. Do not read the framework source in `node_modules/@hozu`.

## The loop
```
__RUN__ hozu add feature tasks --page / --with detail,toggle,filter,remove   # then edit the texts it lists
                                          # add auth to the list for sign-in and per-user data
__RUN__ hozu map                           # outline of the app with file:line, before a change
__RUN__ hozu check                         # after every change: types, rules, contracts
__RUN__ hozu check --update-lock           # only to accept a clean, intended behaviour change
__RUN__ hozu get / --select button --forms  # try pages without a server: text, attributes, forms
__RUN__ hozu post / --field title=Ship --next /   # submit a form like a browser
__RUN__ hozu browse / --do 'click Save'     # real browser, no server: errors, widgets, text after steps
```
__NOTE__
## Rules
- After `hozu add feature`, do not print the generated files: edit the texts it lists; `hozu map` shows the rest.
- Apply the fix each diagnostic gives; do not work around a rule.
- Every behaviour change comes with a contract change.
- Do not edit `__SKILL__/`: `__RUN__ hozu skill` rewrites it for the installed Hozu version.
