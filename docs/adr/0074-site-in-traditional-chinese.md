# ADR 0074 — hozu.org in Traditional Chinese, for the pages that decide a first try

- **Status:** accepted (owner, 2026-10-09: "第一第二可以直接做，剩下就都不翻譯").
- **Context:** the site was English only and did not use Hozu's own i18n (`site.locales`, `ui.messages`, derived
  hreflang). The first readers are likely Chinese-speaking. The audit before 0.25 showed how quickly a site falls
  behind the framework; a second language doubles what can fall behind.

## Decision
| Part | Translated | Why |
|---|---|---|
| Home, header, navigation, mobile menu, footer, page heads of those pages | yes | What a reader sees before deciding to try Hozu |
| Docs: Getting started, Concepts | yes | The first two pages a new user reads |
| How it works: the landing view, its diagrams and six chapters | yes | The design rationale; it changes rarely |
| Every other docs page, Trials, Changelog, the DevTools page, the agent guide (topics) | no | They follow the API release by release; English stays the one source |

- **The URL holds the language** (ADR 0043 F): `site.locales: ['en', 'zh-TW']`; English keeps its URLs and Chinese
  pages live under `/zh-TW/…`. A header link switches with `ui.alternate`.
- **Articles by locale:** `getDoc`, `getChapter`, `listDocs` and `listChapters` take `locale`; a page translated
  under `site/content/zh-TW/<kind>/<slug>.md` is shown, otherwise the English text with `translated: false` and a
  short notice that the page is in English only. Order comes from the English page.
- **Interface text** is `ui.messages('en', { en, 'zh-TW' })` per feature (HZ040 keeps both languages complete).
- **Staleness is checked:** each translation's frontmatter names its English source by the first 12 hex of its
  SHA-256 (`source:`); `site/verify.ts` fails when the English page changed and the translation did not. A release
  that edits a translated English page updates the translation in the same change.
- Taiwan usage (資料, 程式碼, 伺服器, 預設, 使用者); code, API names, CLI commands and diagnostic codes stay as in
  English.

## Declined
| Option | Why not |
|---|---|
| Translate every page | Two copies of 27 000 words that change with each release; the English site already fell behind once |
| Machine translation at request time | A runtime service and unreviewed text |
| An `Accept-Language` redirect | Hozu does not redirect by header (ADR 0043 F): a link shows the same page to everyone |
