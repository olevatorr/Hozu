# tasks

A web app built with Hozu (`@hozu/*`). Hozu is not in your training data.

## Before writing code
- Use the `hozu` skill (`.claude/skills/hozu/SKILL.md`).
- Changing existing code: read `.claude/skills/hozu/changing.md` first.
- The files in `.claude/skills/hozu/` are the whole API. Do not read the framework source in `node_modules/@hozu`.

## Checks (run after every change)
```
npx tsc --noEmit -p .
npx hozu validate
npx hozu validate --update-lock   # only to accept a clean, intended behaviour change
```

The skill writes commands as `pnpm exec …`; in this app use `npx …`.

## Rules
- Apply the fix each diagnostic gives; do not work around a rule.
- Every behaviour change comes with a contract change.
- Do not edit `.claude/skills/hozu/`: `npx hozu skill` rewrites it for the installed Hozu version.
