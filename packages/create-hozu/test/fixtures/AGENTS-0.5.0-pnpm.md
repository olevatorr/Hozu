# demo

A web app built with Hozu (`@hozu/*`). Hozu is not in your training data.

## Before writing code
- Read `.agents/skills/hozu/SKILL.md` before writing or changing any Hozu code.
- Changing existing code: read `.agents/skills/hozu/changing.md` first.
- The files in `.agents/skills/hozu/` are the whole API. Do not read the framework source in `node_modules/@hozu`.

## The loop
```
pnpm exec hozu add feature tasks --page / --with detail,toggle,filter,remove   # then edit the texts it lists
                                          # add auth to the list for sign-in and per-user data
pnpm exec hozu map                           # outline of the app with file:line, before a change
pnpm exec hozu check                         # after every change: types, rules, contracts
pnpm exec hozu check --update-lock           # only to accept a clean, intended behaviour change
pnpm exec hozu get / --select button --forms  # try pages without a server: text, attributes, forms
pnpm exec hozu post / --field title=Ship --next /   # submit a form like a browser
```

## Rules
- After `hozu add feature`, do not print the generated files: edit the texts it lists; `hozu map` shows the rest.
- Apply the fix each diagnostic gives; do not work around a rule.
- Every behaviour change comes with a contract change.
- Do not edit `.agents/skills/hozu/`: `pnpm exec hozu skill` rewrites it for the installed Hozu version.
