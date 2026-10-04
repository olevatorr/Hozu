---
title: Getting started
description: Create your first Hozu app and verify a working feature.
order: 1
---

## New to the terminal? Paste this into your agent

Open Claude Code, Codex or Cursor in an empty folder and paste this prompt. Replace the last line with what you want to build.

```text
Set up a new Hozu web app for me in this folder, step by step, and explain each step in plain words.

1. Check that Node.js is version 22.18 or newer (`node -v`). If it is missing or older, stop and tell me how to install it.
2. Run `npm create hozu@latest my-app -- --agent claude` (use `--agent agents` if you are not Claude Code), then `cd my-app` and `npm install`.
3. Before writing any code, read the Hozu skill in `my-app/.claude/skills/hozu/SKILL.md` (or `my-app/AGENTS.md`). Hozu is not in your training data: follow the skill, not what you remember from other frameworks.
4. Build the first page of the app I describe below. Run `npx hozu check` and fix every problem it reports.
5. Start `npm run dev` in the background and tell me the address to open (usually http://localhost:3000). Tell me that the dock at the bottom of the page is Hozu DevTools: I can choose Select, click a part and describe a change for you.

My app: <describe what you want, e.g. "a reading list where I add books and mark them as read">
```

## Create an app

Hozu requires Node 22.18 or newer. Its configuration and application files use TypeScript that Node runs with native type stripping.

Choose the guide for your coding agent when you create the app:

```sh
npm create hozu@latest my-app -- --agent claude
cd my-app
npm install
```

Use `--agent agents` for Codex, Cursor or Copilot, or `--agent both` for a team using several agents. These flags install the corresponding project instructions and the Hozu authoring skill.

## Add a feature

A scaffold gives you a list query, an add form, a state machine, contracts and in-memory resolvers. Give the feature a name and an explicit route:

```sh
npx hozu add feature tasks --page /tasks
npx hozu check
npx hozu get /tasks
```

The output tells you which files and user-facing text to edit. To include common interactions from the start, add `--with detail,toggle,filter,remove`. The `auth` option also scaffolds an account flow; replace its demonstration sign-in before using it in production.

## Find your way around

| File | Responsibility |
| --- | --- |
| `hozu.config.ts` | Register the schema adapter, features, routes and pages. |
| `routes.ts` | Declare paths and their parameter schemas. |
| `features/tasks/model.ts` | Declare data, events and behaviour. |
| `features/tasks/views.ts` | Describe the UI and its contracts. |
| `features/tasks/feature.ts` | Register the feature: its modules, imports and exports. |
| `features/tasks/server.ts` | Implement the feature's queries and mutations. |
| `app.ts` | The app module: resolvers, the session store and client components. |
| `app.css` | Load Tailwind and application styles. |

Relative TypeScript imports end in `.ts`. Imports are explicit: there are no auto-imported helpers or routes inferred from filenames.

## Make a change and check it

Edit the scaffold's text or data model, then run `npx hozu check`. It checks TypeScript, the framework rules and every behaviour contract. Use `npx hozu get /tasks --forms` to inspect the resulting page without starting a server.

For local browser development, `npm run dev` starts the app with reloads on every edit and [Hozu DevTools](/docs/devtools): select a part of the page and hand your agent a request that names its file and line. `npm start` runs the same app without them (`hozu serve`, which runs the app module named by `project({ app })`) as production, unless `NODE_ENV` is set: an app with sessions then needs `SESSION_SECRET` (`openssl rand -hex 32`), and refuses to start without it. The in-process commands are enough to inspect text, status codes, links and native forms during a change.

The scaffold keeps data in memory. Add durable storage in the server resolvers when your application needs persistence.

## Understand the design

Read [How Hozu works](/how-it-works/why-ai-first) for the decisions behind this API and their trade-offs.
