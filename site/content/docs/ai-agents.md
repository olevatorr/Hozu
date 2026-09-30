---
title: Working with AI agents
description: Give an agent the installed API and a short, verifiable change loop.
order: 9
---

## Install the matching guide

Hozu's authoring skill ships with the framework version: a short core (`SKILL.md`, with a complete, tested example and a task index), change recipes, and one small topic per task that `hozu docs <topic>` prints. Every diagnostic ends with the topic to read. Give an agent that reference rather than asking it to infer an unfamiliar API.

| Option | Files written |
| --- | --- |
| `--agent claude` | `CLAUDE.md` and `.claude/skills/hozu/` |
| `--agent agents` | `AGENTS.md` and `.agents/skills/hozu/` |
| `--agent both` | Both sets of instructions and skills |

After upgrading Hozu, run `npx hozu skill` to refresh the guide for the installed version. Review generated instruction changes alongside the upgrade.

## Describe behaviour, not just appearance

A useful request says who may see the data, what should happen when an operation fails, and which existing behaviours must keep working. For example: “Add a priority to each task. It appears in the list and detail page, defaults to normal, and can be selected when adding a task.”

The agent can then change the schemas, event, mutation input, form and contracts together. Acceptance criteria should include the page's visible result and the relevant failure cases.

## Keep the loop short

1. Run `hozu map` to locate declarations and routes.
2. Print the topic the change needs with `hozu docs <topic>`, then read the feature's own lines.
3. Edit the declarations, resolvers, views and contracts together.
4. Run `hozu check` and fix its diagnostics.
5. Run `hozu get` or `hozu browse` to verify the intended result without starting a server; verify what other users see, reloads and sign-out once in one `browse` chain with `--js both`.

Scaffold common behaviours with `hozu add feature` instead of repeatedly rebuilding their state machines and contracts. The command lists generated declarations and user-facing text to adapt.

## Use structured output

Add `--json` when a tool consumes the result. Diagnostics include source locations, causes and fixes; inspection commands expose the same canonical program the runtime uses.

Keep changes to the behaviour lock intentional. A green check is one layer of evidence, alongside page inspection, browser tests where needed and acceptance criteria written by the person requesting the change.

## Know what the trials establish

Hozu's trial records include both correctness and cost. They show specific runs, not a universal guarantee that an agent cannot make a mistake. Read the methods, comparison baseline and limitations before treating an outcome as a prediction for your own application.

## Understand the design

Read [How Hozu works](/how-it-works/why-ai-first) for the decisions behind this API and their trade-offs.
