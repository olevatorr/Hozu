# Environment

```ts
project({
  env: {
    files: ['.env', '.env.local'],                          // read by the CLI; a later file wins, the shell wins over all
    server: z.object({ DB_URL: z.string(), API_INTERNAL: z.string().url().optional() }),
    public: z.object({ SUPPORT_EMAIL: z.string().email(), API_URL: z.string().url() }),
    internal: { API_URL: 'API_INTERNAL' },                  // on the server, 'either' effects call the internal URL
  },
})
```
- **Parsed at startup:** a missing value stops startup.
- **Who reads what:** resolvers `ctx.env` (server); views `ui.env(PublicEnv).SUPPORT_EMAIL`; fetch.ts `env` (public);
  machines cannot read env (HZ041).
- **Public values are sent to the browser.** Secrets go in `server`; a public name that looks secret (`…_SECRET`,
  `…_TOKEN`, `…_KEY`) is HZ084.
- Keep `.env` and `.env.local` out of git.

<!-- more -->

- **Parsing:** defaults and `z.coerce` apply.
- **Public values** reach page payloads and a static export (written into the pages at export time). Rename a
  secret-looking name `PUBLIC_…` only if it is meant to be public.
- **`internal`:** for an API the browser reaches at its public URL and the server reaches inside the network.
  - fetch.ts keeps reading `env.API_URL`;
  - on the server it gets `API_INTERNAL` when that is set, and the public value otherwise;
  - the browser and CSP `connect` only ever see the public one;
  - a mapping to undeclared variables is HZ085.
- **`files`** are read by `hozu dev`, `serve`, `check`, `get`, `call`, `browse`, `build` and `env`. On the edge
  (`createHandler`) and on hosting platforms, set the variables in the platform.
- The files are read after `hozu.config.ts` is imported: a value the config itself reads at import time (rare)
  comes from the shell. Resolvers, views and fetch.ts read the parsed env and see the files.
- **`npx hozu env`** lists every variable: its side, whether it is required, its default, whether it is set now,
  and its internal mapping. `--example` writes `.env.example`.
- **Reserved by Hozu:**
  - `PORT` (hozu dev also uses `PORT + 1`);
  - `HOST`;
  - `SESSION_SECRET` (required in production with sessions);
  - `NODE_ENV`;
  - `HOZU_TRANSFORM_CACHE=0`.
