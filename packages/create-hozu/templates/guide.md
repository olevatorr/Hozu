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
__RUN__ hozu browse / --do 'fill Title=Ship' --do 'press Enter'   # Chrome, with and without JS, no server
```
__NOTE__
## Rules
- After `hozu add feature`, do not print the generated files: edit the texts it lists; `hozu map` shows the rest.
- Apply the fix each diagnostic gives; do not work around a rule.
- A contract only where a transition decides (a guard, a `navigate`, a computed value). Every other change is
  reviewed in `hozu.lock.json`: after `hozu check --update-lock`, list the accepted `now:` lines in your summary.
- Do not edit `__SKILL__/`: `__RUN__ hozu skill` rewrites it for the installed Hozu version.
