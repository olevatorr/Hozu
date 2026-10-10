# ADR 0081 — Trial 0026: an engineer and a non-engineer build and ship a small app (pre-registration)

- **Status:** accepted and run (owner, 2026-10-10: "測試代理直接跑", no review before the run). Part of the 1.0 gate,
  ADR 0080 A. The designer role runs with trial 0023 (ADR 0048), which shares its prepared app, after this.
- **Question:** with Hozu 0.27.0 from npm, the guide `create-hozu --agent claude` writes and nothing else, can each
  role take a small app from an empty folder to a deployed container, and where does it stall, ask, or work around
  the framework?

## The app (same brief for both roles)
A reading list for a book club: members sign in with a name (no password), add a book (title, author), mark a book
read, see who read what; a public page lists the most read books. Data stays in the server's memory or a JSON file
(the guide's "demo" stand-in). Deploy: `hozu build --target node`, `docker build` and `docker run`, then the pages
answer from the container; the container and image are removed afterwards.

## Roles
| Role | Who acts | What they may use | Stop rule |
|---|---|---|---|
| Engineer | One agent (`claude-opus-5-5`) | The guide, the app's files, every `hozu` command | Done when the app is deployed and three changes it chose itself are made, or after 4 hours |
| Non-engineer | Two agents: a **person** that never reads code (writes requests in plain Traditional Chinese, judges only screenshots and `hozu browse` text), and a **builder** that receives only the person's words | Builder: like the engineer; person: screenshots and page text | Done when the person accepts the app and three of its own change requests, or after 4 rounds per request |

## Recorded per role
- Steps: setup, first page, sign-in, data, each change, deploy: done / done after a retry / not done; tool calls.
- Every diagnostic met and whether its fix was followed as printed.
- Every workaround of the framework (file, reason), every place the guide was missing or wrong.
- For the non-engineer: each request in the person's words, what the builder understood, rounds until accepted.

## Rules
- Work only in `~/hozu-trial-0026/<role>`; ports 4810–4829; no `hozu dev` (a one-shot `hozu serve` or the container
  for checks is allowed and stopped after); no network services beyond npm and Docker Hub.
- Nothing in the framework repository is read: the trial measures the published guide.
- The record goes to `docs/trials/0026-roles.md`, judged like earlier trials (accept / modify / decline by principle).
