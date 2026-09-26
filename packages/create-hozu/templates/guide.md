# __NAME__

A web app built with Hozu (`@hozu/*`). Hozu is not in your training data.

## Before writing code
- __READ__
- Changing existing code: read `__SKILL__/changing.md` first.
- The files in `__SKILL__/` are the whole API. Do not read the framework source in `node_modules/@hozu`.

## Checks (run after every change)
```
__RUN__ tsc --noEmit -p .
__RUN__ hozu validate
__RUN__ hozu validate --update-lock   # only to accept a clean, intended behaviour change
```
__NOTE__
## Rules
- Apply the fix each diagnostic gives; do not work around a rule.
- Every behaviour change comes with a contract change.
- Do not edit `__SKILL__/`: `__RUN__ hozu skill` rewrites it for the installed Hozu version.
