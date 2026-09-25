# ADR 0010 — Capability parity with mainstream frameworks

- Status: accepted (the user asked that Tenon can do everything mainstream frameworks can); G1–G13 implemented and tested
- Scope: capabilities of Nuxt 4, Next.js 16 and SvelteKit 2 that an application actually uses. Visual parity is
  ADR 0009; this ADR is about what an app can *express*.

## Matrix
| # | Capability | Nuxt / Next / SvelteKit | Tenon before | Decision |
|---|---|---|---|---|
| 1 | Conditional rendering on data | `v-if`, `{cond && …}`, `{#if}` | only `when(machineStates)` | **G1** `ui.if(guard, then, else, motion?)` |
| 2 | Lists of primitives | yes | objects with a key only | **G2** `ui.each(list, null, item)` keys by value |
| 3 | Typed internal links | `NuxtLink`, `Link`, `href` | a hand-built string or `fn` | **G3** `ui.link(route, params)` value |
| 4 | Fetch on changed input (search, filters, pagination) | `useFetch` watch, SWR, `load` invalidation | not possible: a missing payload key stays pending | **G4** the client fetches queries whose key is not in the payload |
| 5 | Redirects and auth guards | middleware, `redirect()` | head errors map to 404/500 only | **G5** `ui.page(…, { redirects: { Unauthorized: login } })` |
| 6 | Login and logout (writing the session) | cookies API | resolvers read the session only | **G6** signed-cookie sessions; mutations get `setSession` |
| 7 | Custom 404 page | `error.vue`, `not-found.tsx`, `+error` | plain text | **G7** `project({ notFound: route })` |
| 8 | Window and document events (shortcuts, resize, scroll) | `useEventListener`, `svelte:window` | none | **G8** `ui.window({ on })` / `ui.document({ on })` |
| 9 | Trusted HTML (CMS, Markdown output) | `v-html`, `dangerouslySetInnerHTML`, `{@html}` | none | **G9** `ui.html(value)`; **TN030** when the value can come from user input |
| 10 | File uploads | forms, `FormData` | file metadata only | **G10** `ui.dom.files` carries upload tokens; multipart transport; resolvers read the bytes |
| 11 | Live data | websockets, SSE libraries | `freshness: 'live'` is only a render mode | **G11** SSE invalidation stream; live queries refetch on the client |
| 12 | Favicon, theme colour, web manifest | `app.head`, metadata API | none | **G12** `site.icon` / `site.themeColor` |
| 13 | Error isolation | error boundaries | a widget crash could stop hydration | **G13** a widget that throws keeps its fallback and reports once |
| 14 | Third-party scripts (analytics) | `useScript`, `next/script` | only through a widget | kept: a leaf widget with `load: 'idle'` is the canonical form |
| 15 | API routes and webhooks | `server/api`, route handlers, `+server.ts` | the Node handler is composable | kept: compose `createHandler` with any HTTP router |
| 16 | UI that persists across navigation (audio player, open chat) | SPA router with layouts | full navigation + View Transitions | **open**: needs soft navigation that keeps the islands matched by node id; a separate ADR |
| 17 | Internationalisation | `@nuxtjs/i18n`, `next-intl`, paraglide | none | **open**: needs locale-aware routes and messages as data (a separate ADR) |
| 18 | Responsive image generation (resize, AVIF/WebP) | `@nuxt/image`, `next/image` | hashed assets with dimensions | **open**: needs a native image library (sharp); proposal to follow |

Already equivalent: SSR, streaming, SSG/ISR/SWR, SPA-like interactivity (islands), SEO metadata, sitemap and robots,
forms, keyboard and pointer events, CSS (Tailwind, plugins, dark mode, animations), page transitions, prefetch and
prerender, code-split client libraries, dev server with CSS hot swap, typed data layer, and tests (contracts).

## Decisions in detail
- **G1** `ui.if(test, then, otherwise, motion?)`: `test` is a guard over context, bindings or params; `then` and
  `otherwise` are child lists. The server renders the branch; the client swaps branches when the test flips,
  with enter/leave motion. It hydrates only when the test reads context.
- **G2** `key: null` keys items by their own value; duplicates keep their first node.
- **G3** `ui.link(route, params)` is a ValueExpr `{ link, params }`. The route identity is checked (TN007), and
  params are typed by the route and checked like any value.
- **G4** is not refetching (principle 9). Server-fetched data is still never fetched again; only keys the server did not
  render are fetched (`POST /_tenon/query`). Public and user scopes follow the same rules as on the server.
- **G5** A declared error of the head query can name a route; the server answers `303 See Other` to it.
- **G6** `sessionCookie({ name, secret })` in `@tenon/adapter-node`: HMAC-signed, HttpOnly, SameSite=Lax. Mutation
  resolvers receive `setSession(value | null)`, validated against `project({ session })`.
- **G8** `ui.window` / `ui.document` render nothing and bind listeners while visible; payloads use `ui.dom`.
- **G9** Only values that come from query results or literals may be rendered as HTML. Context, DOM fields and
  params are client- or URL-controlled, so rendering them as HTML is **TN030** (unsafe-html).
- **G10** Upload tokens: `ui.dom.files` returns `{ name, size, type, token }`; the transport sends multipart when
  an input contains tokens; the resolver calls `ctx.file(token)` to get the bytes.
- **G11** `/_tenon/live` is a server-sent-events stream of invalidated tags. The client refetches the live queries
  on the page that match those tags.
- Open items 16–18 are listed so the gap is visible; each needs its own ADR before code.

## Implementation notes
- The `if` node stores its branches as `ifTrue` / `ifFalse`: an IR object with a `then` property would be treated as a
  thenable by `await`.
- User-scoped resolvers see `session: Session | null`. Anonymous callers share the `user:null` partition, so
  resolvers can answer `Unauthorized` (G5/G6) instead of the framework failing with Unexpected.
- The client runtime is code-split. Motion, widget mounting, the live stream and upload encoding load only when a
  page's payload needs them, so the initial JS stays at 7.0 KB gzipped (P7 now counts the entry plus static
  chunks).
- A wrapper widget that is an island root keeps its children outside the island. Only their own islands
  hydrate, so a page-wide wrapper (smooth scrolling) no longer ships the whole view.
