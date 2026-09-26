# ADR 0011 — Gap analysis against mainstream frameworks, ranked

- Status: accepted. Tier 1 is implemented (ADR 0014), Tier 2 items 6 (ADR 0015), 7 and 12 (ADR 0016), 8 and 9 (ADR 0017), 10 and 11 (ADR 0018): Tier 2 is complete. Tiers 3–4 are open. Rewrites (item 12) were dropped by decision.
- Supersedes the "open" rows 16–18 of ADR 0010 by placing them in one ranked list.

## Method
ADR 0010 started from capabilities we thought of. This ADR starts from what the frameworks actually export.
Every public module of the installed packages was listed, grouped by capability, and checked against Tenon's
code:

| Framework | Version | Surface read |
|---|---|---|
| Next.js | 16.3.6 | `next/*` subpaths, `next/navigation`, `next/headers`, `next/cache`, file conventions, `NextConfig` |
| Nuxt | 4.5.2 | auto-imported composables, built-in components, `nuxt.config` schema, `routeRules` |
| SvelteKit | 2.70.3 | `$app/{navigation,forms,server,state,paths,environment}`, `@sveltejs/kit`, hooks, page options |
| Astro | 7.3.5 | `astro:{assets,i18n,middleware,prefetch,actions,env,transitions,content}`, config keys |
| React Router | 8.4.0 | framework-mode exports (`use*`, `Form`, `Await`, `Meta`, `Links`, `ScrollRestoration`…) |

Legend: ✅ equivalent · ◐ partial · ✗ missing · ⊘ excluded by a principle (kept excluded).

## Inventory
### Routing and navigation
| Capability | Mainstream | Tenon | Evidence |
|---|---|---|---|
| Path params, typed | all | ✅ | `route({ path, params })`, schema-checked in `routing.ts` |
| Catch-all / optional segments (`[...slug]`, `[[lang]]`) | all 5 | ✗ | `routing.ts` only knows `:name` → `([^/]+)` |
| **Search params** (`?q=&page=`) typed, readable, writable | all 5 (`useSearchParams`, `useRoute().query`, `page.url`) | ✗ | no search in `RouteDef`, no ValueExpr source |
| Navigate with params / to a created item | all 5 (`goto`, `navigateTo`, `redirect`) | ◐ | `TransitionConfig.navigate?: RouteDecl`, no params |
| Client-side navigation keeping UI alive (layouts, player, open chat) | Next, Nuxt, SvelteKit, RR; Astro opt-in `ClientRouter` | ✗ | full document navigation + View Transitions (ADR 0010 #16) |
| Nested layouts | all 5 | ◐ | a page lists `views`; shared views are reused, but nothing persists across pages |
| Scroll restoration, route announcer, focus on navigate | all 5 | ◐ | native with document navigation; needs work once soft navigation exists |
| Navigation progress indicator (`useNavigation`, `NuxtLoadingIndicator`) | 4 | ✗ | — |
| Leave guards (`beforeNavigate`, `useBlocker`) | 4 | ✗ | — |
| Shallow routing (`pushState` without a load) | SvelteKit, Next, RR | ✗ | — (follows from search params) |
| Prefetch / prerender on intent | all 5 | ✅ | speculation rules |
| Static redirects, rewrites, `basePath`, `trailingSlash` | Next, Nuxt, Astro, SvelteKit | ✗ | only data-driven `head.redirects` |

### Data and mutations
| Capability | Mainstream | Tenon | Evidence |
|---|---|---|---|
| Server data loading, dedup, cache, tags, invalidation | all 5 | ✅ | `@tenon/data`, ADR 0005 |
| Streaming / pending UI (`Suspense`, `Await`, `loading.tsx`) | all 5 | ✅ | `ui.query` pending + in-order streaming |
| Refetch on input change | all 5 | ✅ | G4 |
| **Load more / infinite scroll** (accumulate pages) | all 5 (by hand or `useInfiniteQuery`) | ✗ | `ui.query` renders only the current input's result |
| Mutations / server functions | all 5 | ✅ | `mutation` + resolvers |
| **Forms that work without JS or before hydration** (form actions, `<Form>`, server actions) | SvelteKit, RR, Next, Astro actions | ✗ | mutations run only through a hydrated machine |
| Field-level validation errors returned by the server (`fail`, `invalid`) | SvelteKit, RR, Astro actions | ◐ | declared errors are named; no per-field issue list |
| Optimistic UI | Next `useOptimistic`, RR fetchers, SvelteKit remote functions | ◐ | expressible with `assign` before `invoke`, no rollback helper; needs a documented pattern + contract |
| Live data | Astro live, SvelteKit live queries | ✅ | G11 SSE |
| Uploads | all | ✅ | G10 |

### Server, security, deployment
| Capability | Mainstream | Tenon | Evidence |
|---|---|---|---|
| **Error page for failures (500)** + error reporting hook (`handleError`, `instrumentation`, `error.tsx`) | all 5 | ✗ | `handler.ts` answers `500 text/plain`; no hook |
| **CSRF protection for mutations** (origin check) | SvelteKit `checkOrigin`, Next server actions, Astro `security.checkOrigin` | ◐ | only `SameSite=Lax` on the session cookie |
| **CSP** (nonces/hashes for inline scripts), SRI | Next, Astro `security`, SvelteKit `csp` | ✗ | inline payload and bootstrap scripts have no nonce/hash |
| Request middleware (headers, cookies, rewrites, `locals`) | all 5 | ◐ | compose `createHandler` by hand; no response header / cache-control control per route |
| **Web-standard handler** (`Request → Response`) for serverless/edge (Vercel, Netlify, Cloudflare, Deno, Bun) | all 5 | ✗ | `createHandler(IncomingMessage, ServerResponse)` only |
| Typed environment variables, public vs secret | Astro `astro:env`, SvelteKit `$env`, Nuxt `runtimeConfig`, Next | ✗ | resolvers read `process.env` untyped; nothing for the client |
| Sessions | Astro, RR, SvelteKit cookies | ✅ | G6 |
| SSG / ISR / SWR, on-demand revalidation by tag | all 5 | ✅ | adapters |
| Draft / preview mode | Next `draftMode`, Nuxt `usePreviewMode` | ✗ | — |

### Content, media, i18n
| Capability | Mainstream | Tenon | Evidence |
|---|---|---|---|
| **Internationalisation** (locale routes, messages, `hreflang`, formatting) | Astro `astro:i18n`, Next `i18n`, Nuxt/SvelteKit via official modules | ✗ | ADR 0010 #17 |
| **Responsive images** (srcset, AVIF/WebP, lazy, priority) | Next, Nuxt Image, Astro `astro:assets` | ◐ | hashed assets + dimensions + TN028; no resizing (ADR 0010 #18) |
| Font optimisation (self-host, metric-matched fallback) | Next `next/font`, Astro `fonts` | ◐ | preload only; no fallback metrics |
| Markdown / MDX / content collections | Astro content, Nuxt Content | ◐ | resolvers can return HTML for `ui.html`; no typed file collections |
| OG image generation | Next `ImageResponse`, `opengraph-image` | ✗ | static `head.image` only |
| PWA / service worker / offline | SvelteKit `$service-worker`, Next `offline` | ✗ | — |

### Developer experience
| Capability | Mainstream | Tenon | Evidence |
|---|---|---|---|
| HMR that keeps state for view/logic edits | all 5 | ◐ | `@tenon/dev` hot-swaps CSS; other edits reload the page |
| Component / page render tests | Astro container, Testing Library | ◐ | contracts cover behaviour; no render assertion helper |
| Web vitals / analytics | Next `web-vitals`, `useScript` | ✅ | leaf widget with `load: 'idle'` (ADR 0010 #14) |
| Dialogs / popovers / teleport | Nuxt `Teleport`, portals | ✅ | `popover`, `popovertarget`, `commandfor` in the DOM vocabulary (top layer, no portal needed) |

### Excluded by principle (unchanged)
Global mutable client stores (`useState`, context) · arbitrary effects in views · manual route cache config ·
file-based routing. Each has a canonical Tenon form: `exports`, machines, derived render plans, explicit
`route()` declarations.

## Ranking
Importance = (share of real sites that need it) × (blocking vs. has a workaround) × (visible to the people
who use the site, or a security/production risk). Four tiers; each tier is one phase with its own ADR.

### Tier 1 — blocks common sites or is a production risk
| # | Gap | Why first |
|---|---|---|
| 1 | **Search params**: `route({ search: schema })`, readable in views/queries/head, writable by `ui.link` and `navigate`; shallow updates | every list, search, filter, pagination and shareable tab state |
| 2 | **Navigate with params and values** (`navigate: { route, params }`, from event/result) | "create → open the new item" is basic CRUD |
| 3 | **Error page + error hook**: `project({ error: route })`, `onError(err, request)` for reporting | a 500 in plain text is not acceptable for a human-facing site |
| 4 | **Security baseline**: origin check on `/_tenon/*` POSTs, CSP with per-response nonce (or hashes for static pages), default security headers | mainstream ships these by default |
| 5 | **Progressive forms**: a `ui.form` bound to a mutation submits as a normal POST before hydration / without JS, server re-renders with the result; field issues returned as data | resilience + accessibility; SvelteKit/RR/Next all do it |

### Tier 2 — expected by most production apps
| # | Gap |
|---|---|
| 6 | **Soft navigation with persistent layouts** (was ADR 0010 #16): keep islands with the same node id, swap the rest, scroll restoration, route announcer, focus, progress indicator, leave guard |
| 7 | **Web-standard handler** `(Request) => Response` in the runtime, Node adapter becomes a thin wrapper; unlocks edge/serverless adapters |
| 8 | **Responsive images** (was #18): `ui.img` from an asset generates `srcset` + AVIF/WebP at build (sharp as a build-only dependency), `priority` for LCP |
| 9 | **i18n** (was #17): locale as a route segment, messages as typed data per feature, `hreflang` + `lang` derived, `Intl` formatting ops |
| 10 | **Load more / infinite scroll**: an `each` over accumulated pages (`ui.query` with a `mode: 'append'` cursor) |
| 11 | **Route grammar**: catch-all and optional segments |
| 12 | **Request middleware** as data: per-route response headers, static redirects/rewrites, `trailingSlash`, `basePath` |

### Tier 3 — valuable, has workarounds
| # | Gap |
|---|---|
| 13 | Typed environment (`project({ env: { server, public } })`), validated at startup |
| 14 | Font fallback metrics (size-adjust) to remove font-swap layout shift |
| 15 | Content collections: typed Markdown/MDX files as a built-in query source |
| 16 | Optimistic update pattern with rollback on `failed` + validator support |
| 17 | View-level HMR preserving machine state |
| 18 | Field-level validation issues for any mutation (shared with #5) |

### Tier 4 — niche
Draft/preview mode · OG image generation · PWA/service worker · render-assertion test helper.

## Proposed phases
- **Phase 6 (Tier 1)**: items 1–5. Each gets a new diagnostic where the mistake is structural (e.g. a link that
  omits a required search param, a form without a mutation, a `navigate` whose params do not type-check).
- **Phase 7 (Tier 2)**: items 6–12, split into 7a navigation (6), 7b platform (7, 12), 7c media and i18n (8, 9),
  7d data and routes (10, 11).
- **Phase 8 (Tier 3)** and Tier 4 only on request.

Every phase keeps the gate, the P7 client budget (soft navigation will need its own lazy chunk) and the parity
report green, and adds its cases to the showcase or blog example.

## Principle check
- None of the items needs a global store or effects in views.
- Soft navigation (6) keeps rendering mode derived: it fetches the next page's HTML/payload from the same
  render plan and never refetches server data.
- Images (8) and fonts (14) add build-time third-party dependencies. The zero-dependency rule concerns runtime
  packages, so these would sit in `@tenon/bundle`/`@tenon/css`-style build packages. **This needs explicit
  approval** (same as `@tenon/css`).
- Edge adapters (7) for paid platforms: only the adapter code, no deployment and no accounts.
