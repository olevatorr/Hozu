---
title: Rendering follows the data
description: Declare ownership and freshness; let the compiler derive caching, streaming and islands.
order: 4
---

## Begin with a data requirement

A product page and an account panel can share a screen while needing different treatment. The product description may be public and rarely change. The account panel belongs to the signed-in visitor. Choosing a single rendering label for the whole page hides that distinction. Hozu instead asks each query to declare who can see its result and how fresh that result must be.

The compiler follows those declarations through the recorded view tree. It derives a render plan for individual regions and a separate plan for hydration. The public authoring surface therefore describes data requirements, rather than asking you to maintain another collection of route-level caching switches. [ADR 0006](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0006-rendering.md) establishes this boundary.

## Public data can take several forms

This declaration describes a public catalogue that can be computed ahead of time. The output schema defines what the view may read, while the policy fields express facts about the data.

```ts
export const catalogue = query({
  input: z.object({}),
  output: z.array(Product),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
```

Public data with static freshness produces a static region. A `freshness: { revalidate: 60 }` policy instead declares a revalidation interval; `freshness: { swr: 60 }` declares stale-while-revalidate behaviour. `freshness: 'request'` reads public data again on every request without caching it, and `freshness: { poll: 30 }` has the browser re-read the mounted data on that timer (5 seconds to a day), with public results cached for half the interval. Those intervals are examples of application policy, not recommendations or benchmark measurements. A server is needed to carry out regeneration or background refresh after deployment.

Live freshness makes a region request-time and uses the framework’s live-query transport. It cannot become an entirely static GitHub Pages deployment simply because the surrounding HTML is static. Use the explorer above to compare these cases, then inspect the actual project with `hozu plan`; the illustration deliberately omits nested dependencies.

## User scope is a hard boundary

A user-scoped query belongs to the request’s session identity. Its data must never enter a shared cacheable region, and it is not cached across requests at all: its freshness is `'request'` (read once per request), `'live'` (also pushed) or `{ poll: s }` (re-read by the browser on a timer). Any other freshness is a diagnostic (HZ049). Scope is an ownership constraint, not a hint for the compiler to weigh against performance.

```ts
export const myNotes = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: 'signedIn',
})
```

The project declares the session schema, and the resolver receives the appropriate identity. `access` says who may read it, and the framework enforces it before the resolver runs. Public resolvers do not receive that session. A public cacheable query whose input depends on user-scoped request data is also unsafe; the validator checks data flow rather than only reading the outermost query’s label.

A static shell can contain a request-specific region that is streamed separately. The shell remains shareable while the private region is produced for that request. Nested regions inherit the more dynamic requirements of their dependencies, so a collection of individually reasonable declarations can still produce a request-time plan.

## HTML and hydration answer different questions

Rendering determines when HTML and data are produced. Hydration determines which browser-side nodes need interactive behaviour. A static query does not make a view interactive, and request-time content does not automatically mean that an entire page needs a client application.

Hozu derives islands from machine-bound nodes: events, state-dependent visibility and context-bound values require the client runtime. Two declarations add islands of their own: a client component, whose declared module runs in the browser, and a region whose query declares `runs: 'browser'`, which the server renders as its pending branch and the browser fills. Unbound content remains HTML. Server-fetched data is serialized into the payload instead of being fetched again when an island starts. This separation lets a mostly static article contain a small interaction without declaring the whole document a client component. A page fetches the client runtime only if an island actually renders on it: an island inside a list, a branch or a query result is preloaded where it first appears, so a page whose list is empty ships no JavaScript ([ADR 0036](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0036-preload-where-islands-render.md)).

A page assertion such as `assert: 'static'` asks the validator to confirm the derived result. It cannot override an incompatible query or force private data into a cached page. Read the plan when the result surprises you; changing an assertion is not a substitute for understanding the dependency that caused it.

## One kind of navigation

Every internal link loads a document. Speculation rules let supported browsers prerender the target on hover, so the load is usually instant, and no client router decides what survives a link. Hozu 0.8 removed the derived soft navigation of [ADR 0015](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0015-phase-7a-soft-navigation.md), because neither the checker nor the lock could see what it kept ([ADR 0043](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0043-0-8-close-the-escape-hatches.md)).

State that must outlive a page lives in the URL (a seed), on the server (a query) or in a client component's own storage, with one case the framework derives. Since 0.21 a machine whose view the next page also shows (a view that two or more pages list, or the same address again) keeps its snapshot in the tab's `sessionStorage` and resumes it after the new page has hydrated the server's HTML. Which machines keep state follows from the pages' declared views, not from a choice in code; a reload, a framed page and a DevTools preview start fresh ([ADR 0067](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0067-0-21-continuity.md), narrowed by [ADR 0069](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0069-0-22-trial-feedback.md)).

Browsers differ in how a document load looks. Chrome, Edge and Safari hold the old page until the new one paints, so a load shows no blank frame. The Arc browser (checked on 1.167.1, Chromium 154) blanks the window on every document load, a plain multi-page site included; frameworks with a client router hide it there because they do not load documents. Hozu keeps document loads (see [ADR 0073](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0073-0-26.md)), so in Arc every link shows a brief blank frame.

Cross-document view transitions solve the visual side. Hozu 0.4.0 emits `@view-transition { navigation: auto }`, allowing supported browsers to transition between ordinary documents without adding a client router, and reduced-motion preferences remove the animation. Since 0.21 the build marks the root element of every view that two or more pages list with `data-hz-view`, and `@hozu/css` gives it a `view-transition-name`, so a shared header or panel stays in place while the rest of the page changes. Nobody names these by hand.

This website sets no transition names of its own: its footer, listed on every page, is named by the framework. Its interactive explanations use native controls and CSS, so their existence does not require a Hozu island. The [changelog](/changelog) and [ADR 0032](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0032-0-4-static-site-gaps.md) describe the framework changes. For the deployment consequences, continue with the [deployment guide](/docs/deploying).
