---
title: Working with AI agents
description: Give an agent the installed API and a short, verifiable change loop.
order: 10
---

## Install the matching guide

Hozu's authoring skill ships with the framework version: a core of at most 4 KB (`SKILL.md`: the change loop, what to touch for each kind of change, the few rules no diagnostic can check, and a task index) and one small topic per task that `hozu docs <topic>` prints, including `hozu docs feature` with a complete, tested example. Everything a diagnostic checks is taught by that diagnostic, and every diagnostic ends with the topic to read. Give an agent that reference rather than asking it to infer an unfamiliar API.

| Option | Files written |
| --- | --- |
| `--agent claude` | `CLAUDE.md` and `.claude/skills/hozu/` |
| `--agent agents` | `AGENTS.md` and `.agents/skills/hozu/` |
| `--agent both` | Both sets of instructions and skills |

Upgrade with `npx -p @hozu/cli@latest hozu migrate`, then follow the `next:` lines it prints; its second run refreshes the guide for the installed version. Review generated instruction changes alongside the upgrade.

## Describe behaviour, not just appearance

A useful request says who may see the data, what should happen when an operation fails, and which existing behaviours must keep working. For example: “Add a priority to each task. It appears in the list and detail page, defaults to normal, and can be selected when adding a task.”

The agent can then change the schemas, event, mutation input, form and contracts together. Acceptance criteria should include the page's visible result and the relevant failure cases.

## Keep the loop short

1. Run `hozu map`: the session shape, the line to verify with, each file's role and every declaration with its `file:line`.
2. Print the topic the change needs with `hozu docs <topic>`, then read the feature's own lines.
3. Edit the declarations, resolvers and views together; add a contract only where a transition decides (a guard, a navigation or a computed value).
4. Run `hozu check` and apply the fix each diagnostic gives. Accept an intended behaviour change with `hozu check --update-lock` and list the accepted `now:` lines for review.
5. Run `hozu get` or `hozu browse` to verify the intended result without starting a server; verify what other users see, reloads and sign-out once in one `browse` chain with `--js both`.

Scaffold common behaviours with `hozu add feature` instead of repeatedly rebuilding their state machines and contracts. The command lists generated declarations and user-facing text to adapt.

## Use structured output

Add `--json` when a tool consumes the result. Diagnostics include source locations, causes and fixes; inspection commands expose the same canonical program the runtime uses.

The agent's `CLAUDE.md` / `AGENTS.md` instructions sit between `hozu` markers; `hozu skill` rewrites that block for the installed version and leaves the rest of the file alone. Keep changes to the behaviour lock intentional. A green check is one layer of evidence, alongside page inspection, browser tests where needed and acceptance criteria written by the person requesting the change.

## Know what the trials establish

Hozu's trial records include both correctness and cost. They show specific runs, not a universal guarantee that an agent cannot make a mistake. Read the methods, comparison baseline and limitations before treating an outcome as a prediction for your own application.

## Understand the design

Read [How Hozu works](/how-it-works/why-ai-first) for the decisions behind this API and their trade-offs.
