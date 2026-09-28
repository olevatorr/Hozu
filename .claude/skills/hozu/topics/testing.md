# Testing

- **Without a server** (no need to start one): `hozu get /path --select 'button[aria-pressed=true]' --forms` and
  `hozu post / --field title=A --next 'POST / @Delete' --next /`.
  - `post` submits like a browser **without JavaScript** (a native form post), so it also checks no-JS behaviour.
  - Each step prints its status, redirect and `set-cookie` attributes (`HttpOnly`, `SameSite`); the session cookie
    is kept across `--next` steps. Two users: run two commands.
  - Endpoints: `hozu get '/api/items?x=1'`.
- **In a real browser, still without a server:** `hozu browse / --do 'fill Search=park' --do 'click Tech Park'`.
  - It uses the installed Chrome / Chromium / Edge (`HOZU_CHROME=/path` to choose), loads the page, waits for
    hydration and runs the steps in order: `fill <label>=<value>`, `select <label>=<option>`, `check <label>`,
    `click <name>`, `press <key>`, `wait <ms>`, `goto <path>`. Labels and names are what a user reads (aria-label,
    `<label>`, placeholder, button text, `title`).
  - It prints the uncaught exceptions, `console.error`s and failed requests, every widget on the page (mounted,
    failed, size, canvases), the visible text and `--select <css>` elements; exit code 1 when anything failed.
  - `--screenshot shot.png` saves the viewport (open it to look); `--reduced-motion` emulates reduced motion.
  - Use it once after client-side work (widgets, islands); `get` / `post` stay the fast checks.
- In code: `const app = testApp({ build, resolvers })` from `@hozu/testing`; `await app.get('/')` →
  `{ status, headers, html, text, payload }`; `app.post(path, fields)` submits a native form.
- Vitest: add `hozuTransform()` from `@hozu/transform/vite` to `plugins`.
- Browser tests: wait for `html[data-hozu-ready]` (set after hydration) before clicking.
