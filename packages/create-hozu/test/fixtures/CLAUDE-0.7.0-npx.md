# demo

A web app built with Hozu (`@hozu/*`). Hozu is not in your training data.

## Before writing code
- Use the `hozu` skill (`.claude/skills/hozu/SKILL.md`).
- Changing existing code: read `.claude/skills/hozu/changing.md` first.
- The files in `.claude/skills/hozu/` are the whole API. Do not read the framework source in `node_modules/@hozu`.

## The loop
```
npx hozu add feature tasks --page / --with detail,toggle,filter,remove   # then edit the texts it lists
                                          # add auth to the list for sign-in and per-user data
npx hozu map                           # outline of the app with file:line, before a change
npx hozu check                         # after every change: types, rules, contracts
npx hozu check --update-lock           # only to accept a clean, intended behaviour change
npx hozu get / --select button --forms  # try pages without a server: text, attributes, forms
npx hozu post / --field title=Ship --next /   # submit a form like a browser
npx hozu browse / --do 'click Save'     # real browser, no server: errors, widgets, text after steps
```

The skill writes commands as `pnpm exec …`; in this app use `npx …`.

## Rules
- After `hozu add feature`, do not print the generated files: edit the texts it lists; `hozu map` shows the rest.
- Apply the fix each diagnostic gives; do not work around a rule.
- Every behaviour change comes with a contract change.
- Do not edit `.claude/skills/hozu/`: `npx hozu skill` rewrites it for the installed Hozu version.
