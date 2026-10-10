# Trial 0026 — An engineer and a non-engineer build and ship a small app (ADR 0081)

**Question:** with Hozu 0.27.0 from npm and only the guide `create-hozu --agent claude` writes, can each role take a
small app (a book club's reading list) from an empty folder to a deployed container, and where does it stall?

**Answer (qualitative, one run per role, `claude-opus-5-5`):**
- **Both finished and shipped, with no framework rule worked around.** The engineer took about 33 tool calls and under
  an hour, including three changes of its own (owner-only delete, filters in the URL, a page per book with comments)
  and a container that answered its pages. The non-engineer pair took four rounds and about 80 builder tool calls;
  the person accepted the site and "would recommend working this way".
- **The person never saw code and still drove the product.** Its requests were plain Traditional Chinese; it caught
  what only a user would: the words 讀過 / 讀完 were unclear, a delete button that needed JavaScript would fail on
  members' old phones, the organiser's link should not show to everyone, cancelling a delete by pressing delete again
  was confusing for older members.
- **The friction was in the guide and the deploy, not the model.** The scaffold's sign-in refused Chinese names; the
  guide had no JSON-file stand-in, no confirm-without-JavaScript pattern, no typed server env in a feature; the deploy
  copied the app's data folder into the image and suggested running with the development `.env` and no volume.
- **Not measured:** tokens or cost; people (ADR 0080: none were recruited). The person is an agent playing a person.

## Setup
| | Engineer | Non-engineer |
|---|---|---|
| Who | One agent | A *person* agent (no code, screenshots and page text only) and a *builder* agent (gets only the person's words), relayed by the lead |
| Start | `npx create-hozu@0.27.0 app --agent claude` | The same |
| Brief | The ADR 0081 brief, verbatim | The person's own first message (sign in by name, add books, mark read, who read what, a public most-read page, large text, mobile, no duplicates) |
| Changes | Three of its own | Three of the person's, plus its round-by-round corrections |
| Deploy | `--target node`, `docker build`, `docker run`, curl, cleanup | The same, with a production env file and a data volume, restarted once |

## What happened, per round (non-engineer)
| Round | The person asked | The builder did | Friction met |
|---|---|---|---|
| 1 | The site, in plain words | Name sign-in (rule changed to accept Chinese names), books with author, who-read-what, public `/popular`, duplicates folded (NFKC, case, punctuation), JSON file store | The scaffold's name rule only accepted ASCII letters; no JSON-file stand-in in the guide; `--screenshot` only the viewport |
| 2 | The club's name; rank by finished; delete with a confirmation; **the monthly book**, only the organiser updates it | Renames, ranking, delete with a confirm in context (`ui.set`), a `monthly` feature with an organiser passphrase checked in the resolver | The confirm needed JavaScript and nothing said so until `browse --js off`; no recipe for a setting one person edits; server env type in a feature undocumented |
| 3 | Delete on every phone; organiser link only for the organiser; **"I'm reading this too"** with progress | `details` + a form for the confirm (no JS), `ORGANIZER_NAME` decides who sees the link, a cross-feature tag (`exports` / `imports`) keeps the counts current | HZ014 taught that a `part` returns one element; the no-JS confirm pattern was the builder's own idea |
| 4 | **Time and place** of the meeting; a "不要刪" button | Fields added; the cancel is a link back (no JS); local deploy with production secrets and a volume | `.dockerignore` lacked the data folder; the printed `docker run` used `.env` and no volume; `site.url` still localhost; `hozu get` needs `@hozu/testing`, absent with `--omit=dev` |

## The engineer's run
| Step | Result |
|---|---|
| Scaffold, guide, first page | Done (`hozu add feature books --page / --with auth,toggle`) |
| Sign-in, data | Done; JSON file at `env.server.DATA_FILE` |
| Owner-only delete | Done with `access: { owner }`, checked with `hozu call` |
| Filters in the URL | Done first time |
| Book page with comments | Done after one retry (a TS error, then HZ016 for `e.fields.text ?? null`) |
| Deploy | Done; login, add, mark read through the container; `/popular` refreshed |

## The asks and the decisions
| # | Ask | From | Decision |
|---|---|---|---|
| 1 | The scaffold's sign-in refuses Chinese (any non-ASCII) names | N | **Accept:** a Unicode name rule (letters of any script, 1–20, trimmed) in `hozu add feature … --with auth` and the example |
| 2 | No demo-grade store between "an array" and "a database" | E, N | **Accept:** a recipe "A JSON file for a demo" with its limits (one process, a volume, backups), referenced from `hozu docs data` |
| 3 | A confirm before a destructive action needs JavaScript unless you know `details` + a form | N | **Accept:** a recipe "Confirm before deleting, without JavaScript" (`details`, a form, a cancel link), and the views topic points at it |
| 4 | `--target node`'s `.dockerignore` copies the app's data folder into the image | E, N | **Accept:** the generated ignore file also lists the entries of the app's `.gitignore` (what is not in git is not in the image), with `!.env.example` kept |
| 5 | The printed `docker run` uses the development `.env` and no volume | N | **Accept:** `next:` says to pass a production env file, and names a volume for each folder the app writes (from the `.gitignore` entries above) |
| 6 | `site.url` on localhost is not flagged by a deploy target | N | **Accept:** `--target` lists it under "the platform needs" |
| 7 | "the platform needs" lists a server env that has a default | E | **Accept, a bug:** only variables without a default are required |
| 8 | HZ016's fix offers only a contract when the decision comes from `??` / `?:` that could be a plain copy | E | **Accept:** the fix names both: copy the value, or write the contract |
| 9 | `hozu browse --screenshot` captures the viewport only; no way to scroll | N | **Accept:** `--screenshot` takes the full page; a `scroll <selector|bottom>` step |
| 10 | `--js both` runs both modes against one server state, so a delete then "differs" | E | **Accept as documentation:** `browse --help` and the testing topic say the modes share data; isolating them is out of scope |
| 11 | The typed server env inside a feature's `server.ts` (`Implement<Session, Env>`) is undocumented | E, N | **Accept:** the env topic shows it |
| 12 | `part` must return one element; `current` in plain views; `ui.format.date` takes `YYYY-MM-DD`; `ui.each` keys for rows without an id | N, E | **Accept:** one line each in the views / formatting topics |
| 13 | `hozu add feature --page /` leaves the scaffold's `site` feature unused | E | **Accept:** the command removes it when nothing else uses it, or says so |
| 14 | A setting one person edits (the organiser) | N | **Modify:** a recipe for "one person may change this" with a signed-in role from the session (`access: { allow }`), and why a name alone is not identity |
| 15 | `hozu get` inside the container | N | **Decline:** the image is production (`--omit=dev`); check from outside with curl or `hozu get --build` |
| 16 | More than one machine per feature | E | **Declined again** (ADR 0069 C) |
| 17 | `/?show=all` answers 200 instead of redirecting to `/` | E | **Investigate** before deciding: canonical URLs leave defaults out of links; whether a request carrying a default should redirect is a separate rule |

## Limits
- One run per role, one model, one app; the person is an agent instructed to act as a person.
- The lead relayed every message verbatim but chose when a round ended and what the final question asked.
- The builder's answers to the person were written by the builder; the lead did not edit them.
- Local deploys only; no hosting platform was used.
