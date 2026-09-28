---
title: Getting started
description: Create your first Hozu app and verify a working feature.
order: 1
---

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
| `server.ts` | Register implementations of queries and mutations. |
| `app.css` | Load Tailwind and application styles. |

Relative TypeScript imports end in `.ts`. Imports are explicit: there are no auto-imported helpers or routes inferred from filenames.

## Make a change and check it

Edit the scaffold's text or data model, then run `npx hozu check`. It checks TypeScript, the framework rules and every behaviour contract. Use `npx hozu get /tasks --forms` to inspect the resulting page without starting a server.

For local browser development, the generated application's `npm start` script starts its server (`node --import @hozu/transform/register serve.ts`: the transform lets views and machines use ordinary TypeScript). The in-process commands are enough to inspect text, status codes, links and native forms during a change.

The scaffold keeps data in memory. Add durable storage in the server resolvers when your application needs persistence.

## Understand the design

Read [How Hozu works](/how-it-works/why-ai-first) for the decisions behind this API and their trade-offs.
