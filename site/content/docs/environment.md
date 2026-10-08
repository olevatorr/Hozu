---
title: Environment
description: Declare every variable once, keep secrets on the server, and let the server call your APIs on the inside.
order: 9
---

## Declare it once

Every variable the app reads is declared in `hozu.config.ts`, with a schema. Hozu parses them at startup: defaults and `z.coerce` apply, and a missing or wrong value stops the app before it serves a page.

```ts
project({
  env: {
    files: ['.env', '.env.local'],
    server: z.object({ DATABASE_URL: z.string(), POSTS_API_INTERNAL: z.string().url().optional() }),
    public: z.object({ POSTS_API: z.string().url(), SUPPORT_EMAIL: z.string().email() }),
    internal: { POSTS_API: 'POSTS_API_INTERNAL' },
  },
})
```

- **Server variables** are read by resolvers as `ctx.env`. They never leave the server.
- **Public variables** are read by views (`ui.env(PublicEnv).SUPPORT_EMAIL`) and by `fetch.ts`. They are written into pages and static exports, so anyone can read them. A public name that looks like a secret (`…_SECRET`, `…_TOKEN`, `…_KEY`) is HZ084; move it to `server`.

## Env files

`files` lists the files the Hozu CLI reads: `hozu dev`, `serve`, `check`, `get`, `call`, `browse`, `build` and `env`. A later file wins over an earlier one, and a variable already set in the shell wins over every file. Missing files are skipped. Nothing is read by convention: what is not listed is not read.

New apps list `.env` and `.env.local` and keep both out of git. `hozu check` warns (HZ086) when a listed file exists and git would commit it. Commit `.env.example` instead.

## See what is set

```sh
npx hozu env             # every variable: server or public, required, default, set now, internal URL
npx hozu env --example   # writes .env.example (names and public defaults, no secrets)
```

It also lists the variables Hozu itself reads: `PORT`, `HOST`, `SESSION_SECRET` (required in production when the app has sessions), `NODE_ENV` and `HOZU_TRANSFORM_CACHE`.

## Internal URLs

An API often has two addresses: the public one the browser calls (`https://api.example.com`) and an internal one the server reaches inside the network (`http://api.internal:8080`) without TLS, a load balancer or egress.

A resolver (`runs: 'server'`) simply reads the internal variable. An effect with `runs: 'either'` runs the same `fetch.ts` on both sides. Map the public variable to the internal one with `internal`:

- on the server, `fetch.ts` reads `env.POSTS_API` as the internal URL when it is set, and the public one otherwise;
- in the browser it is always the public URL; the internal value never reaches a page;
- the CSP `connect-src` lists the public origin only.

A mapping to undeclared variables is HZ085.

## A service's address and secret

Resolvers in another language (`remote()`, see [Resolvers in Go](/docs/go)) name server variables instead of values: `url: { env: 'NOTES_SERVICE_URL' }` and `secret: { env: 'NOTES_SERVICE_SECRET' }`. Declare both in `env.server`, the secret with `z.string().min(16)`, so a short or missing one stops the app at startup; an undeclared name is HZ093. The service reads the same secret from its own environment.

## Where the values come from

| Deployment | Values |
| --- | --- |
| `hozu dev` / `hozu serve` on your machine | the shell, then `files` |
| A Node host | the platform's environment (and `files`, if you ship them) |
| Edge (`createHandler`) | the platform's environment, passed as `env`; no files are read |
| Static export | public values only, written into the pages when you export |
| `testApp` in tests | what you pass: `testApp(app, { env: process.env })` |
