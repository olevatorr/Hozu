# Testing

- **Without a server** (no need to start one): `hozu get /path --select 'button[aria-pressed=true]' --forms` and
  `hozu post / --field title=A --next 'POST / @Delete' --next /`.
  - `post` submits like a browser **without JavaScript** (a native form post), so it also checks no-JS behaviour.
  - Each step prints its status, redirect and `set-cookie` attributes (`HttpOnly`, `SameSite`); the session cookie
    is kept across `--next` steps. Two users: run two commands.
  - Endpoints: `hozu get '/api/items?x=1'`.
- In code: `const app = testApp({ build, resolvers })` from `@hozu/testing`; `await app.get('/')` →
  `{ status, headers, html, text, payload }`; `app.post(path, fields)` submits a native form.
- Vitest: add `hozuTransform()` from `@hozu/transform/vite` to `plugins`.
- Browser tests: wait for `html[data-hozu-ready]` (set after hydration) before clicking.
