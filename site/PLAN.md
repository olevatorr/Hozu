# hozu.org for 0.9: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rebuild hozu.org on a 0.9 `site` kit:
- a Swiss-poster home page that leads designers and vibe coders down to the evidence;
- the inner pages on the same kit.

**Architecture:**
- **In place in `site/`** on the branch `site-0.9`.
  - Kept: routes, Markdown sources, `export.ts`, `verify.ts`.
  - Replaced: every view, `app.css` and `diagrams.ts`.
- **Features:**
  - `content`: pages and queries;
  - `hero`: the "AI change" machine;
  - `play`: the component playground machine;
  - `lab`: the existing pipeline machine, with new views.
- **Shared UI** is the `site` kit in `site/kit/`.

**Tech stack:**
- Hozu 0.9 (workspace packages), and `@hozu/variants` (`tv()`);
- Tailwind v4 through `@hozu/css`, and `@hozu/content` for Markdown;
- `@hozu/adapter-static` for the export, and `@hozu/testing` plus `node:assert` in `verify.ts`.

**Spec:** `site/DESIGN.md`. Read it first. This plan argues from it.

## Global constraints
- **Node:** 22.22.1 (`export PATH=$HOME/.nvm/versions/node/v22.22.1/bin:$HOME/hozu-trial-0020/bin:$PATH`).
- **pnpm:** 10.33.0, and commands run from the repo root unless a step says `site/`.
- **No `@hozu/*` package changes.** If 0.9 cannot express something, record it in `site/FRAMEWORK-GAPS.md`
  (approach → result → root cause). If a principle blocks the design, stop and ask the owner.
- **Rendering:** no `style` attribute; dynamic CSS values go through `vars`.
  - Classes must produce CSS (HZ026), and hooks use `data-*`.
  - No comments in `ui` trees. Comments in TS are at most one line.
- **Pages:** no external fonts or requests; every page is `assert: 'static'`.
- **JavaScript:** only the islands of the hero demo, the playground and the lab. The `CodeBlock` client module loads
  only on pages with `<pre>`.
- **Claims:** every number on the home page comes from `site/features/content/claims.ts`, whose rows carry a trial
  slug.
- **Copy:** in English. Tone A in sections 01–03 and 08, tone B in 04–05, tone C in 06–07 and the inner pages
  (spec, "Tone").
- **Colours:** paper `#f1ede4`, ink `#111010`, red `#fb3a0e`, green `#2fa36b`.
- **Each task ends with the site checks green:**
  ```bash
  pnpm build && pnpm --filter hozu-site check && pnpm --filter hozu-site typecheck \
    && pnpm --filter hozu-site export && pnpm --filter hozu-site verify && pnpm exec biome check site
  ```
- **Commits:** one commit per task on `site-0.9`, ending with the `Co-Authored-By` line. Never push. The owner pushes
  `main`, which deploys.

## Review focus
1. **Reduced motion.** With `prefers-reduced-motion: reduce`, every kinetic headline, ticker and joint rests in its
   final state. Owner: Task 1 (CSS) and Task 8 (verify asserts coverage).
2. **No JavaScript.** With JS off, the hero shows the clean state, the demo button is a no-op, and nothing is hidden
   behind script. Owner: Task 5 (`hozu browse --js off`).
3. **Keyboard.** The flip cards turn on focus, the ticker pause is reachable, and the mobile menu opens with Enter.
   Owner: Task 4 (tabindex and `focus-within`), Task 9 (browser pass).
4. **Narrow screens (360 px).** The hero headline wraps without overflow, and the receipt and tables scroll inside
   themselves. Owner: Task 4 (`overflow-x-auto`, `break-words`), Task 9 (screenshot at 360 px).
5. **Stale numbers.** A claim whose trial page does not exist, or a version tag that differs from
   `packages/core/package.json`, fails verify. Owner: Task 2 and Task 4.

---

### Task 1: theme, motion and the kit skeleton

**Files:**
- Replace: `site/app.css`
- Create: `site/kit/tv.ts`, `site/kit/kit.ts` (via `hozu add kit site`)
- Modify: `site/hozu.config.ts` (`kits: [kit]`, done by the command)
- Delete: `site/REVIEW.md`, `site/INTERACTIVE-REVIEW.md`, `site/verify-browser.ts`
- Replace: `site/FRAMEWORK-GAPS.md` (a header line only)

**Interfaces:**
- Produces:
  - Tailwind colours `paper`, `ink`, `red`, `green`, `sand` (`bg-paper`, `text-ink` …);
  - animations `animate-rise`, `animate-ticker`, `animate-turn`;
  - hooks `[data-rise]`, `[data-ticker]`;
  - `tv` from `site/kit/tv.ts`;
  - `kit` from `site/kit/kit.ts` (id `site`).

- [ ] **Step 1: Scaffold the kit**

```bash
cd site && pnpm exec hozu add kit site && cd ..
git rm -q site/REVIEW.md site/INTERACTIVE-REVIEW.md site/verify-browser.ts
```
Expected: `created site/tv.ts`, `created site/kit.ts`, `edited hozu.config.ts`. If the command writes `site/site/`,
move both files into `site/kit/` and fix the import in `hozu.config.ts` to `./kit/kit.ts`.

- [ ] **Step 2: Replace `site/app.css` with the theme**

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme {
  --color-paper: #f1ede4;
  --color-ink: #111010;
  --color-red: #fb3a0e;
  --color-green: #2fa36b;
  --color-sand: #d8cdbb;
  --font-sans: "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, Menlo, monospace;
  --animate-rise: rise 0.7s cubic-bezier(0.2, 0.9, 0.2, 1) both;
  --animate-ticker: ticker 28s linear infinite;
  --animate-turn: turn 14s linear infinite;
  @keyframes rise {
    from { transform: translateY(110%) skewY(8deg); opacity: 0; }
    to { transform: none; opacity: 1; }
  }
  @keyframes ticker {
    to { transform: translateX(-50%); }
  }
  @keyframes turn {
    from { transform: rotateX(-24deg) rotateY(0deg); }
    to { transform: rotateX(-24deg) rotateY(360deg); }
  }
}

body {
  margin: 0;
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans);
}
:focus-visible {
  outline: 3px solid var(--color-red);
  outline-offset: 3px;
}
[data-rise] > :nth-child(2) { animation-delay: 70ms; }
[data-rise] > :nth-child(3) { animation-delay: 140ms; }
[data-rise] > :nth-child(4) { animation-delay: 210ms; }
[data-rise] > :nth-child(5) { animation-delay: 280ms; }
[data-rise] > :nth-child(6) { animation-delay: 350ms; }
[data-rise] > :nth-child(7) { animation-delay: 420ms; }
[data-rise] > :nth-child(8) { animation-delay: 490ms; }
[data-ticker]:has(input:checked) [data-ticker-track] { animation-play-state: paused; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Sync the tailwind-merge config with the new theme**

```bash
cd site && pnpm exec hozu add kit site --sync && cd ..
grep -n "paper\|ink" site/kit/tv.ts
```
Expected: the generated block lists the custom colours. Without it, `tv()` would merge `bg-paper` and `bg-ink` wrongly
(HZ078 reports a stale block).

- [ ] **Step 4: Restart the gap record**

`site/FRAMEWORK-GAPS.md`:
```markdown
# Framework gaps found while building hozu.org on 0.9

Each entry: approach → result → root cause. Nothing here is worked around silently.
```

- [ ] **Step 5: Run `hozu check` on the site**

Run: `pnpm build && pnpm --filter hozu-site check`
Expected: `0 errors`. The old views still compile against the new stylesheet. Their classes come from `data-*` hooks
that no longer match any rule; Task 3 replaces them.

- [ ] **Step 6: Commit**

```bash
git add -A site && git commit -m "Site 0.9: theme, motion, the site kit skeleton; drop the old review records"
```

---

### Task 2: the release version and the frame (Header, Footer, Tag)

**Files:**
- Create: `site/kit/tag.ts`, `site/kit/header.ts`, `site/kit/footer.ts`
- Modify: `site/kit/kit.ts`, `site/features/content/model.ts` (`getRelease`), `site/app.ts` (resolver),
  `site/features/content/chrome.ts`, `site/verify.ts`

**Interfaces:**
- Consumes: `tv`, theme colours (Task 1).
- Produces:
  - `Tag` (`variant: { tone: 'red' | 'ink' }`, children);
  - `SiteHeader` (props `{ version: string }`, slots `brand`, `nav`);
  - `SiteFooter` (children);
  - the query `getRelease: {} → { version: string }`;
  - the views `Header` and `Footer`, whose names stay the same for `hozu.config.ts`.

- [ ] **Step 1: Write the failing verify check**

In `site/verify.ts`, after the `testApp` loop:
```ts
const release = JSON.parse(await readFile(new URL('../packages/core/package.json', import.meta.url), 'utf8'))
const home = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8')
assert.ok(home.includes(`data-version="${release.version}"`), `header shows ${release.version}`)
console.log(`Header version ${release.version} equals packages/core`)
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter hozu-site export && pnpm --filter hozu-site verify`
Expected: FAIL, `header shows 0.9.0`.

- [ ] **Step 3: Add the query and its resolver**

`site/features/content/model.ts`:
```ts
export const getRelease = query({
  input: z.object({}),
  output: z.object({ version: z.string() }),
  scope: 'public',
  freshness: 'static',
})
```
In `site/app.ts`, read once at startup and implement it:
```ts
const release = JSON.parse(await readFile(new URL('../packages/core/package.json', import.meta.url), 'utf8')) as {
  version: string
}
// in resolvers:
implement(getRelease, () => ({ version: release.version })),
```
Add `getRelease` to the `content` feature's declarations.

- [ ] **Step 4: Write the kit components**

`site/kit/tag.ts`:
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'inline-block px-1.5 py-0.5 font-mono text-xs font-bold leading-none',
  variants: { tone: { red: 'bg-red text-paper', ink: 'bg-ink text-paper' } },
  defaultVariants: { tone: 'ink' },
})
export const Tag = ui.component({
  tag: 'span',
  styles,
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.span({}, children),
})
```
`site/kit/header.ts`:
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'relative z-10 border-b-4 border-ink bg-paper',
    bar: 'mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4',
    skip: 'sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper',
    desktop: 'hidden gap-6 text-xs font-extrabold uppercase tracking-widest md:flex',
    mobile: 'md:hidden',
  },
})
export const SiteHeader = ui.component({
  tag: 'header',
  styles,
  props: z.object({ version: z.string() }),
  slots: ['brand', 'nav', 'menu'],
  render: ({ props, slots, classes }) =>
    ui.header({}, [
      ui.a({ href: '#main', class: classes.skip }, ['Skip to content']),
      ui.div({ class: classes.bar, 'data-version': props.version }, [
        slots.brand,
        ui.nav({ 'aria-label': 'Main navigation', class: classes.desktop }, [slots.nav]),
        ui.details({ class: classes.mobile }, [ui.summary({}, ['Menu']), slots.menu]),
      ]),
    ]),
})
```
`site/kit/footer.ts`:
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({ base: 'bg-ink px-5 py-10 text-sm text-paper' })
export const SiteFooter = ui.component({
  tag: 'footer',
  styles,
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.footer({}, [ui.div({ class: 'mx-auto max-w-6xl' }, children)]),
})
```
`site/kit/kit.ts`:
```ts
import { ui } from '@hozu/core'
import * as footer from './footer.ts'
import * as header from './header.ts'
import * as tag from './tag.ts'

export const kit = ui.kit({ id: 'site', components: [tag, header, footer] })
```

- [ ] **Step 5: Rewrite `site/features/content/chrome.ts`**

```ts
import { ui } from '@hozu/core'
import { SiteFooter } from '../../kit/footer.ts'
import { SiteHeader } from '../../kit/header.ts'
import { Tag } from '../../kit/tag.ts'
import { changelog, doc, home, how, trials } from '../../routes.ts'
import { getRelease } from './model.ts'

const links = () => [
  ui.a({ href: ui.link(doc, { slug: 'getting-started' }) }, ['Docs']),
  ui.a({ href: ui.link(how, null) }, ['How it works']),
  ui.a({ href: ui.link(trials, null) }, ['Trials']),
  ui.a({ href: ui.link(changelog, null) }, ['Changelog']),
  ui.a({ href: 'https://github.com/olevatorr/Hozu' }, ['GitHub']),
  ui.a({ href: 'https://www.npmjs.com/package/@hozu/cli' }, ['npm']),
]
export const Header = ui.view({
  render: () =>
    ui.query(getRelease, {}, {
      ready: (release) =>
        ui.use(SiteHeader, {
          props: { version: release.version },
          slots: {
            brand: ui.a({ href: ui.link(home, null), 'aria-label': 'Hozu home', class: 'flex items-center gap-2 font-black' }, [
              ui.img({ src: ui.asset(new URL('../../assets/logo.png', import.meta.url)), width: 28, height: 28, alt: '' }),
              'HOZU',
              ui.use(Tag, { variant: { tone: 'red' } }, [release.version]),
            ]),
            nav: ui.div({ class: 'flex gap-6' }, links()),
            menu: ui.nav({ 'aria-label': 'Mobile navigation', class: 'mt-3 grid gap-2' }, links()),
          },
        }),
      pending: null,
      failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Header unavailable.']) },
    }),
})
export const Footer = ui.view({
  render: () =>
    ui.use(SiteFooter, {}, [
      ui.p({ class: 'font-black uppercase' }, ['Hozu (ほぞ): the tenon that makes a joint fit.']),
      ui.p({}, ['Built with Hozu and its own component kit. ', ui.a({ href: 'https://github.com/olevatorr/Hozu/blob/main/LICENSE', class: 'underline' }, ['MIT license'])]),
    ]),
})
```

- [ ] **Step 6: Run verify, and break it once on purpose**

Run the global checks. Expected: PASS, with `Header version 0.9.0 equals packages/core`.
Break: temporarily change the resolver to `({ version: '0.0.0' })` and run export and verify. Expected: FAIL
`header shows 0.9.0`. Revert.

- [ ] **Step 7: Commit**

```bash
git add -A site && git commit -m "Site 0.9: header with the derived version tag, footer, Tag"
```

---

### Task 3: the reading layout and every inner page

**Files:**
- Create: `site/kit/prose.ts`, `site/kit/code-block.ts`, `site/kit/code-block.client.ts`
- Delete: `site/features/content/components.ts`, `site/features/content/codeCopy.client.ts` (moved to the kit)
- Replace: `site/features/content/articles.ts` (docs and chapters), and the `Trials`, `Trial`, `Changelog` and
  `NotFound` views in `site/features/content/views.ts`
- Modify: `site/kit/kit.ts`, `site/verify.ts` (copy-component id `site.CodeBlock`, new expected texts)

**Interfaces:**
- Consumes: `Header`, `Footer` (Task 2).
- Produces:
  - `Prose` (children; slots `aside`, `pager`; `variant: { width: 'reading' | 'wide' }`);
  - `CodeBlock` (client; children; `load: 'visible'`);
  - `prose(article)`, a `part()` in `articles.ts` that wraps `article.html` in `CodeBlock` when `article.hasCode`.

- [ ] **Step 1: Change the verify expectations first**

In `site/verify.ts`, replace the copy check `html.includes('content.CodeCopy')` with
`html.includes('site.CodeBlock')`. Replace the home row `'Public query notes.notesOf is keyed by user-scoped data'`
with `'Hozu checks it'`, and `'Every run, trials 0016–0019'` with `'Here is the receipt'`. The home rows fail until
Task 4. That is expected: the only failing row must be `/`.

Run: `pnpm --filter hozu-site export && pnpm --filter hozu-site verify`
Expected: FAIL on `/: missing Hozu checks it`.

- [ ] **Step 2: Move the copy button into the kit**

`site/kit/code-block.ts`:
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'

export const CodeBlock = ui.component({
  tag: 'div',
  props: z.object({}),
  client: new URL('./code-block.client.ts', import.meta.url),
  load: 'visible',
  children: true,
  render: ({ children }) => ui.div({}, children),
})
```
`site/kit/code-block.client.ts` is the current `codeCopy.client.ts` with its import changed to
`import type { CodeBlock } from './code-block.ts'` and `implement<typeof CodeBlock>`.

- [ ] **Step 3: Write `Prose`**

`site/kit/prose.ts`:
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'mx-auto grid gap-10 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_14rem]',
    body: 'prose max-w-none break-words prose-headings:font-black prose-headings:uppercase prose-a:text-ink prose-a:decoration-red prose-a:decoration-2 prose-pre:overflow-x-auto prose-pre:border-4 prose-pre:border-ink prose-pre:bg-ink prose-pre:text-paper',
    aside: 'hidden text-sm lg:block',
    pager: 'col-span-full flex justify-between gap-4 border-t-4 border-ink pt-6 font-bold',
  },
  variants: { width: { reading: { base: 'max-w-6xl' }, wide: { base: 'max-w-7xl' } } },
  defaultVariants: { width: 'reading' },
})
export const Prose = ui.component({
  tag: 'main',
  styles,
  props: z.object({}),
  slots: ['aside', 'pager'],
  children: true,
  render: ({ slots, children, classes }) =>
    ui.main({ id: 'main' }, [
      ui.article({ class: classes.body }, children),
      ui.aside({ class: classes.aside, 'aria-label': 'On this page' }, [slots.aside]),
      ui.nav({ class: classes.pager, 'aria-label': 'Previous and next pages' }, [slots.pager]),
    ]),
})
```
Register `prose` and `codeBlock` in `kit.ts`. Remove `CodeCopy` from the `content` declarations and add nothing:
kit components are declared by the kit.

- [ ] **Step 4: Rewrite the article views on `Prose`**

In `site/features/content/articles.ts`, keep the queries and routes it uses today. Replace each view's body with:
```ts
const body = part((article: Article) =>
  article.hasCode ? ui.use(CodeBlock, {}, [ui.html(article.html)]) : ui.html(article.html),
)
// inside ready: (article) =>
ui.use(Prose, {
  slots: {
    aside: ui.ul({ class: 'sticky top-6 grid gap-2' }, [
      ui.each(article.headings, 'id', (h) => ui.li({}, [ui.a({ href: h.href }, [h.text])])),
    ]),
    pager: ui.div({ class: 'flex w-full justify-between' }, [
      ui.each(article.previous, 'slug', (p) => ui.a({ href: ui.link(route, { slug: p.slug }) }, ['← ', p.title])),
      ui.each(article.next, 'slug', (n) => ui.a({ href: ui.link(route, { slug: n.slug }) }, [n.title, ' →'])),
    ]),
  },
}, [
  body(article),
  ui.a({ href: article.source, class: 'mt-8 inline-block font-bold underline decoration-red' }, ['Edit this page on GitHub']),
])
```
Keep `aria-current="page"` on the active link of the docs and chapter lists (verify checks it). Render the list as a
first `ui.ul` inside the `aside` slot, above the table of contents, with the heading `On this page` kept as text.
Apply the same `Prose` shape to `Trial`, `Changelog` (no pager) and `Trials` (a `ui.table` inside `Prose`).
`NotFound` is `Prose` with one `h1` "Page not found" and a link home.

- [ ] **Step 5: Delete the old views' leftovers and run the checks**

```bash
git rm -q site/features/content/components.ts site/features/content/codeCopy.client.ts site/features/content/diagrams.ts
```
Remove `diagrams.ts` imports. The chapter pipeline/render diagrams return in Task 7 as kit-styled SVG in the lab.
Run the global checks. Expected: everything passes except the `/` rows (Task 4). `hozu check` shows 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A site && git commit -m "Site 0.9: Prose and CodeBlock in the kit; docs, chapters, trials, changelog and 404 on the new layout"
```

---

### Task 4: the home page's static sections and the claims

**Files:**
- Create: `site/features/content/claims.ts`, `site/kit/section.ts`, `site/kit/display.ts`, `site/kit/button.ts`,
  `site/kit/receipt.ts`, `site/kit/steps.ts`, `site/kit/catch-card.ts`, `site/kit/stat-table.ts`,
  `site/kit/ticker.ts`, `site/kit/mono.ts`
- Replace: the `Home` view in `site/features/content/views.ts` (sections 02, 03, 04, 07, 08; 01 is a placeholder
  hero until Task 5, and 05 and 06 are links until Tasks 6 and 7)
- Modify: `site/kit/kit.ts`, `site/verify.ts`

**Interfaces:**
- Produces:
  - `claims: Claim[]`, where `Claim = { id: string; label: string; value: string; trial: string }`, and
    `claim(id): Claim`, which throws on an unknown id;
  - `catches: { code: DiagnosticCode; name: string; story: string; message: string; fix: string }[]`;
  - components `Section` (`variant: { tone: 'paper' | 'ink', depth: 1–5 }`; props `{ label: string, kicker: string }`;
    children), `Display` (h1; props `{ words: { id: string; text: string; accent: boolean }[] }`),
    `Heading` (h2; children), `Button` (`variant: { intent: 'solid' | 'outline' }`; props `{ href: string }`;
    children), `Receipt` (props `{ pay, get }`, each a list of `{ id, label, value, href }`), `Steps`
    (props `{ items: { id, title, body }[] }`), `CatchCard` (props `{ code, name, story, message, fix }`),
    `StatTable` (props `{ caption, rows: { id, label, before, after }[] }`), `Ticker` (props
    `{ items: { id, text }[] }`), and `Mono` (children).

- [ ] **Step 1: Write the failing verify checks for claims and catches**

Append to `site/verify.ts`:
```ts
import { codes } from '@hozu/core/ir'
import { catches, claims } from './features/content/claims.ts'

for (const c of claims) await access(new URL(`./dist/trials/${c.trial}/index.html`, import.meta.url))
for (const c of catches) assert.equal(codes[c.code]?.name, c.name, `${c.code} is ${c.name} in the registry`)
const homeHtml = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8')
for (const c of claims) assert.ok(homeHtml.includes(`href="/trials/${c.trial}"`), `${c.id} links to its trial`)
console.log(`${claims.length} claims link to existing trials; ${catches.length} catch cards match the registry`)
```
Run verify. Expected: FAIL (`claims.ts` missing).

- [ ] **Step 2: Write `claims.ts` (the spec's table, verbatim values)**

```ts
import type { DiagnosticCode } from '@hozu/core/ir'

export interface Claim { id: string; label: string; value: string; trial: string }
export const claims: Claim[] = [
  { id: 'tokens', label: 'Tokens per change, against Nuxt', value: '1.34–1.72×', trial: '0021-0-8-long-run' },
  { id: 'regressions', label: 'Regressions in 16 changes', value: '0', trial: '0021-0-8-long-run' },
  { id: 'silent', label: 'Silent failures in 16 changes', value: '0', trial: '0021-0-8-long-run' },
  { id: 'old', label: 'Regression failures on 0.7, same app', value: '8', trial: '0020-long-run' },
  { id: 'calls', label: 'Tool calls, steps 13–28', value: '270 vs 193', trial: '0021-0-8-long-run' },
  { id: 'js', label: 'Client JS on the notes list', value: '24.0 KB vs 233.9 KB', trial: '0021-0-8-long-run' },
  { id: 'nuxt', label: 'Checks passed after one change', value: '72/72 vs 67/72', trial: '0012-correctness-notes' },
]
export const claim = (id: string): Claim => {
  const found = claims.find((c) => c.id === id)
  if (!found) throw new Error(`unknown claim ${id}`)
  return found
}
export const catches: { code: DiagnosticCode; name: string; story: string; message: string; fix: string }[] = [
  { code: 'HZ049', name: 'cached-user-data', story: 'Your notes, on someone else’s screen.', message: 'A user-scoped query is cached across requests.', fix: "freshness: 'request'" },
  { code: 'HZ054', name: 'single-value-form-read', story: 'You ticked three boxes. The app saw one.', message: 'A multi-value field is read with ui.dom.form.', fix: 'ui.dom.formAll(name)' },
  { code: 'HZ052', name: 'unserved-route', story: 'A link to a page nothing serves.', message: 'A route has no page and no endpoint.', fix: 'Add a page, or link to the endpoint' },
  { code: 'HZ057', name: 'lock-out-of-date', story: 'Behaviour changed. Nobody reviewed it.', message: 'The lock differs from the computed lock.', fix: 'hozu check --update-lock, then read each now: line' },
]
```

- [ ] **Step 3: Write the kit components**

`site/kit/section.ts`:
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'grid border-b-4 border-ink md:grid-cols-[11rem_minmax(0,1fr)]',
    meter: 'border-ink p-4 text-xs font-extrabold uppercase tracking-widest md:border-r-4',
    bar: 'mt-2 h-2 bg-sand',
    fill: 'block h-full bg-red',
    body: 'min-w-0 px-5 py-14 md:px-10',
    kicker: 'font-mono text-xs font-bold text-red',
  },
  variants: {
    tone: { paper: { base: 'bg-paper text-ink' }, ink: { base: 'bg-ink text-paper' } },
    depth: { 1: { fill: 'w-1/5' }, 2: { fill: 'w-2/5' }, 3: { fill: 'w-3/5' }, 4: { fill: 'w-4/5' }, 5: { fill: 'w-full' } },
  },
  defaultVariants: { tone: 'paper', depth: 1 },
})
export const Section = ui.component({
  tag: 'section',
  styles,
  props: z.object({ label: z.string(), kicker: z.string() }),
  children: true,
  render: ({ props, children, classes }) =>
    ui.section({}, [
      ui.div({ class: classes.meter, 'aria-hidden': 'true' }, [
        props.label,
        ui.div({ class: classes.bar }, [ui.span({ class: classes.fill }, [])]),
      ]),
      ui.div({ class: classes.body }, [ui.p({ class: classes.kicker }, [props.kicker]), ...children]),
    ]),
})
```
`site/kit/display.ts`:
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const Word = z.object({ id: z.string(), text: z.string(), accent: z.boolean() })
export const Display = ui.component({
  tag: 'h1',
  styles: tv({ base: 'text-5xl font-black uppercase leading-[0.9] tracking-tight md:text-7xl' }),
  props: z.object({ words: z.array(Word) }),
  render: ({ props }) =>
    ui.h1({ 'data-rise': '' }, [
      ui.each(props.words, 'id', (w) =>
        ui.span({ class: 'inline-block animate-rise pr-[0.25em]', toggle: { 'text-red': w.accent } }, [w.text]),
      ),
    ]),
})
export const Heading = ui.component({
  tag: 'h2',
  styles: tv({ base: 'text-3xl font-black uppercase leading-none md:text-5xl' }),
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.h2({}, children),
})
```
`site/kit/button.ts`:
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  base: 'inline-block px-4 py-3 text-sm font-extrabold uppercase tracking-wide',
  variants: {
    intent: {
      solid: 'bg-ink text-paper shadow-[6px_6px_0_var(--color-red)]',
      outline: 'border-4 border-ink text-ink',
    },
  },
  defaultVariants: { intent: 'solid' },
})
export const Button = ui.component({
  tag: 'a',
  styles,
  props: z.object({ href: z.string() }),
  children: true,
  render: ({ props, children }) => ui.a({ href: props.href }, children),
})
```
Callers pass `props: { href: ui.link(route, …) }`, so internal links stay `ui.link` (HZ032).

`site/kit/receipt.ts`:
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const Line = z.object({ id: z.string(), label: z.string(), value: z.string(), href: z.string() })
const styles = tv({
  slots: {
    base: 'max-w-md overflow-x-auto border-4 border-ink bg-white p-5 font-mono text-sm text-ink shadow-[8px_8px_0_var(--color-ink)]',
    head: 'font-bold uppercase',
    row: 'flex justify-between gap-4 py-1',
    rule: 'my-3 border-t-2 border-dashed border-ink',
  },
})
export const Receipt = ui.component({
  tag: 'div',
  styles,
  props: z.object({ pay: z.array(Line), get: z.array(Line) }),
  render: ({ props, classes }) =>
    ui.div({}, [
      ui.p({ class: classes.head }, ['You pay']),
      ui.each(props.pay, 'id', (l) => ui.a({ href: l.href, class: classes.row }, [ui.span({}, [l.label]), ui.b({}, [l.value])])),
      ui.hr({ class: classes.rule }),
      ui.p({ class: classes.head }, ['You get']),
      ui.each(props.get, 'id', (l) => ui.a({ href: l.href, class: classes.row }, [ui.span({}, [l.label]), ui.b({}, [l.value])])),
    ]),
})
```
`site/kit/catch-card.ts` (CSS flip on hover and focus; both faces stay in the DOM for screen readers):
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'group relative h-56 [perspective:900px]',
    inner: 'relative h-full transition-transform duration-500 transform-3d group-hover:rotate-y-180 group-focus-within:rotate-y-180',
    front: 'absolute inset-0 flex items-end border-4 border-paper p-4 text-xl font-black backface-hidden',
    back: 'absolute inset-0 overflow-auto border-4 border-red bg-paper p-4 font-mono text-xs text-ink backface-hidden rotate-y-180',
  },
})
export const CatchCard = ui.component({
  tag: 'div',
  styles,
  props: z.object({ code: z.string(), name: z.string(), story: z.string(), message: z.string(), fix: z.string() }),
  render: ({ props, classes }) =>
    ui.div({ tabindex: 0 }, [
      ui.div({ class: classes.inner }, [
        ui.p({ class: classes.front }, [props.story]),
        ui.div({ class: classes.back }, [
          ui.p({ class: 'font-bold text-red' }, ['✘ ', props.code, ' ', props.name]),
          ui.p({}, [props.message]),
          ui.p({}, ['fix: ', props.fix]),
        ]),
      ]),
    ]),
})
```
`site/kit/ticker.ts` (CSS only; the checkbox pauses it through `:has`):
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'relative overflow-hidden bg-ink py-3 text-sm font-black uppercase text-paper',
    track: 'flex w-max animate-ticker gap-8 whitespace-nowrap',
    pause: 'absolute right-2 top-1/2 -translate-y-1/2 bg-ink px-2 text-xs',
  },
})
export const Ticker = ui.component({
  tag: 'div',
  styles,
  props: z.object({ items: z.array(z.object({ id: z.string(), text: z.string() })) }),
  render: ({ props, classes }) =>
    ui.div({ 'data-ticker': '' }, [
      ui.div({ class: classes.track, 'data-ticker-track': '', 'aria-hidden': 'true' }, [
        ui.each(props.items, 'id', (i) => ui.span({}, [i.text, ' ■'])),
        ui.each(props.items, 'id', (i) => ui.span({}, [i.text, ' ■'])),
      ]),
      ui.label({ class: classes.pause }, [ui.input({ type: 'checkbox' }), ' Pause']),
    ]),
})
```
`site/kit/steps.ts`, `site/kit/stat-table.ts`, `site/kit/mono.ts`:
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const Item = z.object({ id: z.string(), title: z.string(), body: z.string() })
export const Steps = ui.component({
  tag: 'ol',
  styles: tv({ slots: { base: 'mt-8 grid gap-4 md:grid-cols-3', item: 'border-4 border-ink p-5', title: 'font-black uppercase' } }),
  props: z.object({ items: z.array(Item) }),
  render: ({ props, classes }) =>
    ui.ol({}, [
      ui.each(props.items, 'id', (i) =>
        ui.li({ class: classes.item }, [ui.p({ class: classes.title }, [i.title]), ui.p({}, [i.body])]),
      ),
    ]),
})
```
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const Row = z.object({ id: z.string(), label: z.string(), before: z.string(), after: z.string() })
export const StatTable = ui.component({
  tag: 'div',
  styles: tv({ slots: { base: 'mt-6 overflow-x-auto', table: 'w-full border-4 border-ink font-mono text-sm', cell: 'border-t-2 border-ink px-3 py-2 text-left' } }),
  props: z.object({ caption: z.string(), rows: z.array(Row) }),
  render: ({ props, classes }) =>
    ui.div({}, [
      ui.table({ class: classes.table }, [
        ui.caption({ class: 'py-2 text-left font-bold' }, [props.caption]),
        ui.thead({}, [ui.tr({}, [ui.th({ scope: 'col', class: classes.cell }, ['']), ui.th({ scope: 'col', class: classes.cell }, ['Hozu 0.7']), ui.th({ scope: 'col', class: classes.cell }, ['Hozu 0.8'])])]),
        ui.tbody({}, [
          ui.each(props.rows, 'id', (r) =>
            ui.tr({}, [ui.th({ scope: 'row', class: classes.cell }, [r.label]), ui.td({ class: classes.cell }, [r.before]), ui.td({ class: classes.cell }, [r.after])]),
          ),
        ]),
      ]),
    ]),
})
```
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

export const Mono = ui.component({
  tag: 'code',
  styles: tv({ base: 'bg-ink px-1.5 py-0.5 font-mono text-sm text-paper' }),
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.code({}, children),
})
```

If `ui.each` rejects a second `each` over the same list in `Ticker` (duplicate keys in one parent), wrap each `each`
in its own `span`, and record the result in `FRAMEWORK-GAPS.md`.

- [ ] **Step 4: Compose sections 02, 03, 04, 07 and 08 in `Home`**

Start `Home` with a temporary section 01: `ui.use(Display, { props: { words: [{ id: '1', text: 'Your AI writes the
app.', accent: false }, { id: '2', text: 'Hozu checks it.', accent: true }] } })`. It gives the page its single `h1`
and the verify text `Hozu checks it` until Task 5 moves the `h1` into `Hero`.

Import `claim`, `claims` and `catches`. Build the receipt lines with
`href: ui.link(trial, { slug: claim('tokens').trial })`. Copy, verbatim from the spec's tone table:
- **02 "Yes, it costs more. Here is the receipt."** Tone A: "Yes, Hozu eats more tokens. About 1.3–1.7× what Nuxt does
  for the same change. Your agent reads our guide every session, runs the checker, and fixes what it finds before it
  says "done". That's the bill."
  - The pay lines: `tokens`, `calls`.
  - The get lines: `regressions`, `silent`, `js`.
  - The counter-story paragraph links `nuxt` and `old`.
- **03 "Three steps. Your agent does the typing."** `Steps` with Create / Ask your agent / It checks itself; the
  command `npm create hozu@latest` in `Mono`.
- **04 "Mistakes that look fine and still break."** Tone B, `Section` tone `ink`, a 4-column grid of `CatchCard`
  from `catches`.
- **07 "Measured, with the rough edges included."** Tone C. `StatTable` "0.7 vs 0.8 on the same app":
  - regressions 8 → 0;
  - silent steps 5 → 0;
  - geometric-mean cost against Nuxt 2.64–2.73× → 1.34–1.72×.

  Then the two SVGs as `ui.img({ src: ui.asset(new URL('../../../docs/trials/0021-0-8-long-run.svg', import.meta.url)),
  width, height, alt })`, with width and height from the SVG's `viewBox`, and the limits sentence.
- **08 "Build something. Then try to break it."** `Button` Start building → docs, `Button` outline GitHub, then
  `Ticker` with `regressions`, `tokens`, `js`.

- [ ] **Step 5: Run the checks, and break the claims check once**

Run the global checks. Expected: PASS, with `7 claims link to existing trials; 4 catch cards match the registry`.
Breaks, each reverted after it is seen:
- change `HZ054`'s name to `x`: FAIL `HZ054 is x in the registry`;
- change `nuxt`'s trial to `0012-nope`: FAIL (`access`, ENOENT).

- [ ] **Step 6: Screenshot at 1280 and 360 px**

```bash
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; cd site/dist && python3 -m http.server 4801 & SP=$!; sleep 1
for w in 1280 360; do "$C" --headless=new --hide-scrollbars --window-size=$w,4000 --virtual-time-budget=3000 --screenshot=/tmp/home-$w.png http://127.0.0.1:4801/; done
kill $SP; cd ../..
```
Look at both images. Expected: no horizontal overflow at 360 px, and the receipt and table scroll inside themselves.

- [ ] **Step 7: Commit**

```bash
git add -A site && git commit -m "Site 0.9: home sections 02–04, 07–08 from the kit; claims and catch cards checked against trials and the registry"
```

---

### Task 5: the hero (the AI-change machine and `Joint3D`)

**Files:**
- Create: `site/kit/joint.ts`, `site/features/hero/model.ts`, `site/features/hero/views.ts`,
  `site/features/hero/feature.ts`
- Modify: `site/kit/kit.ts`, `site/hozu.config.ts` (home page views `[Header, Hero, Home, Footer]`, features
  `[content, hero, lab]`), `site/hozu.lock.json` (via `--update-lock`)

**Interfaces:**
- Produces:
  - `Joint3D` (props `{ split: boolean }`);
  - the machine `hero.m` with context `{ broken: boolean }` and events `Break`, `Fix`;
  - the view `Hero` (route `home`).

- [ ] **Step 1: The machine (copy-only transitions, reviewed through the lock)**

`site/features/hero/model.ts`:
```ts
import { event, machine, on } from '@hozu/core'
import { z } from 'zod'

export const Break = event({ payload: z.object({}) })
export const Fix = event({ payload: z.object({}) })
export const m = machine({
  context: z.object({ broken: z.boolean() }),
  initialContext: { broken: false },
  initial: 'clean',
  states: ({ ctx }) => ({
    clean: { on: [on(Break, { target: 'broken', assign: () => { ctx.broken = true } })] },
    broken: { on: [on(Fix, { target: 'clean', assign: () => { ctx.broken = false } })] },
  }),
})
```
Neither transition decides (no guard, no `navigate`, no `fn`). Each needs a lock entry, not a contract (HZ058 would
flag a contract).

- [ ] **Step 2: `Joint3D`**

`site/kit/joint.ts`: three boxes of six faces each, with Tailwind 3D utilities only.
```ts
import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

const styles = tv({
  slots: {
    base: 'relative h-64 [perspective:900px]',
    spin: 'absolute left-1/2 top-1/2 transform-3d animate-turn',
    top: 'absolute transform-3d transition-transform duration-700 -translate-y-12 aria-[busy=true]:-translate-y-32 aria-[busy=true]:-rotate-z-6',
    peg: 'absolute transform-3d transition-transform duration-700 aria-[busy=true]:translate-x-40 aria-[busy=true]:rotate-y-45',
    bot: 'absolute transform-3d transition-transform duration-700 translate-y-12 aria-[busy=true]:translate-y-28 aria-[busy=true]:rotate-z-6',
    face: 'absolute -translate-1/2 border-4 border-ink',
  },
})
const wood = 'bg-paper'
export const Joint3D = ui.component({
  tag: 'div',
  styles,
  props: z.object({ split: z.boolean() }),
  render: ({ props, classes }) =>
    ui.div({ role: 'img', 'aria-label': 'A tenon joint that splits when a change is wrong' }, [
      ui.div({ class: classes.spin }, [
        ui.div({ class: classes.top, 'aria-busy': props.split }, [
          ui.i({ class: `${classes.face} h-12 w-36 translate-z-[55px] ${wood}` }, []),
          ui.i({ class: `${classes.face} h-12 w-36 rotate-y-180 translate-z-[55px] ${wood}` }, []),
          ui.i({ class: `${classes.face} h-12 w-[110px] rotate-y-90 translate-z-[72px] bg-sand` }, []),
          ui.i({ class: `${classes.face} h-12 w-[110px] -rotate-y-90 translate-z-[72px] bg-sand` }, []),
          ui.i({ class: `${classes.face} h-[110px] w-36 rotate-x-90 translate-z-6 bg-ink` }, []),
          ui.i({ class: `${classes.face} h-[110px] w-36 -rotate-x-90 translate-z-6 bg-ink` }, []),
        ]),
        ui.div({ class: classes.peg, 'aria-busy': props.split }, [
          ui.i({ class: `${classes.face} h-12 w-14 translate-z-[28px] bg-red` }, []),
          ui.i({ class: `${classes.face} h-12 w-14 rotate-y-180 translate-z-[28px] bg-red` }, []),
          ui.i({ class: `${classes.face} h-12 w-14 rotate-y-90 translate-z-[28px] bg-red` }, []),
          ui.i({ class: `${classes.face} h-12 w-14 -rotate-y-90 translate-z-[28px] bg-red` }, []),
        ]),
        ui.div({ class: classes.bot, 'aria-busy': props.split }, [
          ui.i({ class: `${classes.face} h-12 w-36 translate-z-[55px] ${wood}` }, []),
          ui.i({ class: `${classes.face} h-12 w-36 rotate-y-180 translate-z-[55px] ${wood}` }, []),
          ui.i({ class: `${classes.face} h-12 w-[110px] rotate-y-90 translate-z-[72px] bg-sand` }, []),
          ui.i({ class: `${classes.face} h-12 w-[110px] -rotate-y-90 translate-z-[72px] bg-sand` }, []),
          ui.i({ class: `${classes.face} h-[110px] w-36 rotate-x-90 translate-z-6 bg-ink` }, []),
          ui.i({ class: `${classes.face} h-[110px] w-36 -rotate-x-90 translate-z-6 bg-ink` }, []),
        ]),
      ]),
    ]),
})
```
The faces are written out, not generated by a helper: a plain helper that receives data would be HZ059. A class
built from `classes.face` and literals is a template string of strings, which the transform lowers to `%concat`.
If HZ026 cannot see the literal classes inside it, give each face its full class literally, and record the result in
`FRAMEWORK-GAPS.md`. If `aria-busy` on a decorative node is rejected or announced wrongly, use `data-split` with the
`data-[split=true]:` variant instead, and record which one.

- [ ] **Step 3: The `Hero` view**

`site/features/hero/views.ts`:
```ts
import { ui } from '@hozu/core'
import { Button } from '../../kit/button.ts'
import { Display } from '../../kit/display.ts'
import { Joint3D } from '../../kit/joint.ts'
import { Ticker } from '../../kit/ticker.ts'
import { doc, home, trials } from '../../routes.ts'
import { claim } from '../content/claims.ts'
import { Break, Fix, m } from './model.ts'

export const Hero = ui.view({
  machine: m,
  route: home,
  render: ({ ctx }) =>
    ui.main({ id: 'main', class: 'relative overflow-hidden bg-paper' }, [
      ui.div({ class: 'mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center' }, [
        ui.div({}, [
          ui.use(Display, { props: { words: [
            { id: '1', text: 'Your', accent: false }, { id: '2', text: 'AI', accent: false },
            { id: '3', text: 'writes', accent: false }, { id: '4', text: 'the app.', accent: false },
            { id: '5', text: 'Hozu', accent: true }, { id: '6', text: 'checks', accent: true },
            { id: '7', text: 'it.', accent: true },
          ] } }),
          ui.p({ class: 'mt-5 max-w-md' }, ['It costs more tokens than other frameworks. That is the price of a second pair of eyes on every change.']),
          ui.div({ class: 'mt-6 flex flex-wrap gap-3' }, [
            ui.use(Button, { props: { href: ui.link(doc, { slug: 'getting-started' }) } }, ['Start building →']),
            ui.use(Button, { variant: { intent: 'outline' }, props: { href: ui.link(trials, null) } }, ['See the proof']),
          ]),
          ui.div({ class: 'mt-8 max-w-md border-4 border-ink bg-white shadow-[8px_8px_0_var(--color-ink)]' }, [
            ui.div({ class: 'flex items-center justify-between bg-ink px-3 py-2 text-sm font-bold text-paper' }, [
              'notes · signed in as ada',
              ctx.broken
                ? ui.button({ type: 'button', class: 'bg-green px-3 py-1 font-black', on: { click: ui.send(Fix, {}) } }, ['APPLY FIX'])
                : ui.button({ type: 'button', class: 'bg-red px-3 py-1 font-black', on: { click: ui.send(Break, {}) } }, ['AI CHANGE']),
            ]),
            ui.p({ class: 'px-3 py-2' }, ['Buy milk']),
            ctx.broken && ui.p({ class: 'bg-red/10 px-3 py-2' }, ["Bob's secret · bob ⚠"]),
            ui.p({ class: 'border-t-4 border-ink px-3 py-2 font-mono text-xs', toggle: { 'bg-red text-white': ctx.broken } }, [
              ctx.broken ? '✘ HZ049 your notes would be cached and shown to bob' : '✔ types ok · 0 errors · lock current',
            ]),
          ]),
        ]),
        ui.use(Joint3D, { props: { split: ctx.broken } }),
      ]),
      ui.use(Ticker, { props: { items: [
        { id: 'r', text: `${claim('regressions').value} regressions in 16 changes` },
        { id: 't', text: `${claim('tokens').value} the tokens of Nuxt` },
        { id: 'c', text: 'every change checked' },
      ] } }),
    ]),
})
```
`site/features/hero/feature.ts`: `feature({ id: 'hero', intent: { summary: 'The home page demo: an AI change that
Hozu catches' }, declarations: [model, views] })`. The `Home` view from Task 4 drops its placeholder hero, so the
page has one `h1` (verify).

- [ ] **Step 4: Accept the two copy-only transitions into the lock**

Run: `cd site && pnpm exec hozu check --update-lock && cd ..`
Expected: two `now:` lines: `clean --hero.Break--> broken · broken := true` and the reverse. Read both. They match
the intent.

- [ ] **Step 5: Drive it in a real browser, JS on and off**

```bash
cd site && pnpm exec hozu browse / --js both --do 'click "AI CHANGE"' --select 'p' && cd ..
```
Expected:
- **JS on:** after the click, the text includes `HZ049` and `Bob's secret`, and the joint's middle nodes have
  `aria-busy="true"` (or `data-split="true"`).
- **JS off:** the clean state, no errors.

Then `--do 'click "AI CHANGE"' --do 'click "APPLY FIX"'`. Expected: `✔ types ok`.

- [ ] **Step 6: Commit**

```bash
git add -A site && git commit -m "Site 0.9: the hero, an AI change Hozu catches, and the 3D joint that splits"
```

---

### Task 6: the component playground (section 05)

**Files:**
- Create: `site/features/play/model.ts`, `site/features/play/views.ts`, `site/features/play/feature.ts`,
  `site/features/play/render-snapshot.json`
- Modify: `site/hozu.config.ts` (`Play` after `Home`'s section 04), `site/verify.ts`, `site/hozu.lock.json`

**Interfaces:**
- Consumes: `Button`, `Section`, `CodeBlock`.
- Produces:
  - the machine `play.m`, context `{ intent: 'solid' | 'outline' }`, event `Pick { intent }`;
  - the view `Play`.

- [ ] **Step 1: The failing staleness check**

Append to `site/verify.ts`:
```ts
import { execFileSync } from 'node:child_process'
const snapshot = JSON.parse(await readFile(new URL('./features/play/render-snapshot.json', import.meta.url), 'utf8'))
for (const intent of ['solid', 'outline'] as const) {
  const fresh = JSON.parse(execFileSync('pnpm', ['exec', 'hozu', 'render', 'site.Button', '--variant', `intent=${intent}`, '--props', '{"href":"#"}', '--json'], { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8' }))
  assert.deepEqual(snapshot[intent], { html: fresh.html, class: fresh.class, owned: fresh.owned }, `render snapshot ${intent} is current`)
}
console.log('Playground render snapshot equals hozu render')
```
(`fileURLToPath` from `node:url`.) Run verify. Expected: FAIL (file missing).

- [ ] **Step 2: Write the snapshot from a real run**

```bash
cd site && node -e '
const { execFileSync } = require("node:child_process"); const out = {};
for (const intent of ["solid", "outline"]) { const r = JSON.parse(execFileSync("pnpm", ["exec","hozu","render","site.Button","--variant",`intent=${intent}`,"--props","{\"href\":\"#\"}","--json"], { encoding: "utf8" })); out[intent] = { html: r.html, class: r.class, owned: r.owned } }
require("node:fs").writeFileSync("features/play/render-snapshot.json", JSON.stringify(out, null, 2) + "\n")' && cd ..
```

- [ ] **Step 3: The machine and the view**

`site/features/play/model.ts`:
```ts
import { event, machine, on } from '@hozu/core'
import { z } from 'zod'

const Intent = z.enum(['solid', 'outline'])
export const Pick = event({ payload: z.object({ intent: Intent }) })
export const m = machine({
  context: z.object({ intent: Intent }),
  initialContext: { intent: 'solid' },
  initial: 'ready',
  states: ({ ctx }) => ({ ready: { on: [on(Pick, { assign: (e) => { ctx.intent = e.intent } })] } }),
})
```
`site/features/play/views.ts` renders, inside `Section` (`variant: { depth: 4 }`, "Developers", kicker "05 · Components · 0.9"):
- `Heading` "Declared UI. Checked class by class.";
- two radio-style buttons (`aria-pressed: ctx.intent === 'solid'`), each `on: { click: ui.send(Pick, { intent: 'solid' }) }`
  and the same for `'outline'`;
- the preview: `ctx.intent === 'solid' ? ui.use(Button, { variant: { intent: 'solid' }, props: { href: '#' } }, ['Start building'])
  : ui.use(Button, { variant: { intent: 'outline' }, props: { href: '#' } }, ['Start building'])`. Variants stay
  literals (HZ071), so the choice is a conditional.
- the source, from a string constant with the `Button` declaration's text, in `CodeBlock`;
- the `hozu render` output, from `render-snapshot.json` (imported with `with { type: 'json' }`), the entry matching
  `ctx.intent`, as two conditional `pre` blocks;
- the line "A class that fights another is reported as HZ079." with a link to `ui.link(doc, { slug: 'views' })`;
- the line "This site is built from the same kit."

`href: '#'` triggers no HZ032, because it does not start with `/`.

- [ ] **Step 4: Lock, check, browse**

```bash
cd site && pnpm exec hozu check --update-lock && pnpm exec hozu browse / --js on --do 'click "Outline"' --select '[aria-pressed="true"]' && cd ..
```
Expected: one `now:` line `ready --play.Pick--> ready · intent := intent`, and the outline button pressed after the
click. Run the global checks. Then break the snapshot (edit one class in the JSON) and expect
`render snapshot solid is current` to fail. Revert.

- [ ] **Step 5: Commit**

```bash
git add -A site && git commit -m "Site 0.9: component playground with a render snapshot checked against hozu render"
```

---

### Task 7: under the hood (section 06) and the how-it-works overview

**Files:**
- Replace: `site/features/lab/views.ts` (keep `site/features/lab/model.ts` and its contracts unchanged)
- Modify: `site/hozu.config.ts` (home page views gain `LabTeaser`, a static view in `lab`)

**Interfaces:**
- Consumes: the `lab` machine `m` and its events (unchanged), `Section`, `Heading`, `Button`, `CodeBlock`.
- Produces: the views `How` (route `how`, unchanged name) and `LabTeaser` (static, on the home page).

- [ ] **Step 1: Rewrite `How` on the kit**

- Same machine, same events, same visible states. Every `data-lab-*` hook becomes kit components or Tailwind
  classes.
- Keep the texts verify expects: `Understand the design`, `Run example`, `Machine binding`.
- Each pipeline stage is a box in a 5-column grid: `border-4 border-ink`. The stage reached by the machine gets
  `toggle: { 'bg-red text-paper': … }` (the current `when`/state logic, unchanged).
- Rebuild the pipeline SVG of the old `diagrams.ts` inline here, coloured `var(--color-ink)` / `var(--color-red)`.

- [ ] **Step 2: `LabTeaser` for the home page**

A static view in `lab`: `Section` (`variant: { depth: 4 }`, "Developers", kicker "06 · Under the hood").
- `Heading` "feature() → IR → validator → compiler → runtime".
- One paragraph in tone C: "Every page is planned from what its data declares: who may see it and how fresh it must
  be. Only nodes bound to a machine ship JavaScript. This page ships three islands and nothing else."
- `Button` "Open the lab" → `ui.link(how, null)`, and links to the six chapters through `listChapters` (exported by
  `content`).

- [ ] **Step 3: Contracts and lock unchanged**

Run: `cd site && pnpm exec hozu check && cd ..`
Expected: `contracts 6/6 decisions · lock current`, the same as before the task. The machine did not change, only its
view.

- [ ] **Step 4: Run the checks and commit**

```bash
git add -A site && git commit -m "Site 0.9: the lab and under-the-hood section on the kit; machine and contracts unchanged"
```

---

### Task 8: the JavaScript and motion guards

**Files:**
- Modify: `site/verify.ts`

- [ ] **Step 1: Write the island check**

Replace the old client-JS assertions with:
```ts
const islandPages = new Set(['index.html', 'how-it-works/index.html'])
for (const file of files.filter((name) => name.endsWith('.html'))) {
  const html = await readFile(new URL(file, root), 'utf8')
  const hasClient = html.includes('/_hozu/client.js')
  const allowed = islandPages.has(file) || html.includes('<pre')
  assert.ok(!hasClient || allowed, `${file}: client JavaScript only on island pages or pages with code`)
  if (file === 'index.html') for (const id of ['hero', 'play']) assert.ok(html.includes(`"${id}`), `home binds ${id}`)
}
```

- [ ] **Step 2: Write the motion check**

```ts
const css = await readFile(new URL(`.${(await readFile(new URL('index.html', root), 'utf8')).match(/href="(\/_hozu\/styles\.[0-9a-f]+\.css)"/)![1]}`, root), 'utf8')
assert.match(css, /@media \(prefers-reduced-motion: ?reduce\)\{?[^}]*animation-duration:\s*\.?0?\.01ms!important/, 'reduced motion stops every animation')
for (const name of ['rise', 'ticker', 'turn']) assert.ok(css.includes(`@keyframes ${name}`), `keyframes ${name} shipped`)
console.log('Islands: home (hero, play), how-it-works (lab), CodeBlock on code pages; reduced motion covered')
```

- [ ] **Step 3: Break each once**

- Add a `machine` to the `Trials` view and expect FAIL `trials/index.html: client JavaScript only on island pages`.
- Delete the `prefers-reduced-motion` block from `app.css` and expect FAIL `reduced motion stops every animation`.

Revert both and run the global checks: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A site && git commit -m "Site 0.9: verify allows only the three islands and requires reduced motion"
```

---

### Task 9: browser pass, docs, gate, merge

**Files:**
- Modify: `site/README.md` (the build, content sources, the kit, the islands, verify; delete the old review
  sections), `site/FRAMEWORK-GAPS.md` (what was found)

- [ ] **Step 1: The browser pass**

Serve `site/dist` (as in Task 4, step 6). In Chrome at 1280 px and 360 px, check by hand:
1. the hero words rise, and the joint turns;
2. AI CHANGE splits the joint and turns the output red; APPLY FIX snaps it back;
3. Tab reaches every catch card, and each flips on focus;
4. the ticker's Pause stops it;
5. the playground switches variants;
6. the lab runs;
7. the mobile menu opens with Enter;
8. with macOS "Reduce motion" on, nothing moves.

Write the results (pass or fail per item) into the commit message. Fix failures before going on.

- [ ] **Step 2: Repository checks**

Run: `pnpm lint && pnpm typecheck`, then the global site checks once more.
Expected: green. The site is not part of `pnpm test`, so the full gate is not needed for a site-only change.
`pnpm lint` and `pnpm typecheck` cover it.

- [ ] **Step 3: README and gaps**

Rewrite `site/README.md` around: build and verify commands, content sources, the `site` kit, the three islands, the
claims table, deployment (unchanged). Fill `FRAMEWORK-GAPS.md` with the entries the tasks recorded, or "none
found" with the date.

- [ ] **Step 4: Commit and merge into `main` (no push)**

```bash
git add -A site && git commit -m "Site 0.9: README, framework gaps, browser pass"
git switch main && git merge --no-ff site-0.9 -m "Merge site-0.9: hozu.org rebuilt on the 0.9 site kit"
```
Report to the owner: the commits, the verify output, the browser pass, the gaps. The owner runs
`git push origin main`, which deploys. After the push, check `gh run list --workflow pages.yml --limit 1` for
`success`.
