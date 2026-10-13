# Trial 0028 — Does a new app avoid what Mori met? (ADR 0086)

**Question:** releases 0.29–0.30.1 fixed what the Mori rebuild and trial 0023 met. With Hozu 0.30.1 from npm, do
those fixes hold for an agent that never saw them, building a different app? Does the DevTools request for trial
0023's failed change now pass?

**Answer (`claude-opus-5-5`, local Docker only, no paid service):**
- **R1: yes, the fixes held.** An agent built a pet-grooming studio from `create-hozu@0.30.1` and deployed it in a
  container, with no framework rule worked around: a public site, two roles, uploads, a client chart and a kit. It
  took about 57 tool calls and 190 k tokens. The six probes held, with two gaps:
  - the 403 admin page rendered its admin views; the guide said so only in its long form;
  - `hozu browse` uploaded empty files.
- **R2: 1 of 2.** The new request named the shared `on` once, with one contract to write; this was the 0.29 fix.
  - *Pass (18 tool calls, 82 k tokens):* the agent held the removal with `hozu browse hold`, saw the dialog and gated
    it.
  - *Fail (12 tool calls, 75 k tokens):* the dialog flashed past while the Done task was removed. This is the same
    failure as trial 0023, and nothing in the tools showed it.
- **What changes (0.31, ADR 0087):**
  - `hozu browse` names what a step showed and removed (`shown briefly: …`). The failed run's code shows its dialog
    for 15 ms; the passing run's shows nothing.
  - Uploads carry their bytes in browse.
  - HZ072 and HZ079 no longer give opposite fixes, and HZ026 accepts the typography plugin's `lead`.
  - The 403 guidance moved into the short guide.

## R1 probes
| # | Probe | Result |
|---|---|---|
| 1 | The mobile drawer is above the page | Held. The agent chose a native `popover`; a link inside it was clicked at 390 px |
| 2 | A plain project class beside a colour survives the kit merge | Held (`fine-print` with `text-rose-700!`) |
| 3 | `*` in a callback | Held (line total = price × quantity) |
| 4 | Staff never see admin links or pages | Held for links. The admin pages answered 403, but they rendered their admin views until the agent gated them (now in the short guide) |
| 5 | Uploads | The real server stored the bytes. `hozu browse upload` sent an empty file (fixed in 0.31) |
| 6 | The container starts on its first run | Held. `--target node` named the typography plugin as a devDependency before `docker build`; the container answered every page, and native sign-in worked for both roles |

## R1 diagnostics and guide gaps
| Met | Followed as printed | Outcome |
|---|---|---|
| HZ057, HZ016, HZ078 | Yes | Cleared |
| HZ072 with HZ079 on one class | HZ072's `!`; HZ079 said the opposite | Fixed (ADR 0087 A3) |
| HZ026 for `lead` | Removed the class | Fixed (A4) |
| TS2322 on `access: { allow: part(...) }` | Inlined the callback | The guide's `part` is now typed (A8) |
| `add kit` asked for an installed package | — | Fixed (A6) |

## R2 runs
| Run | Tool calls | Tokens | Check | Note |
|---|---|---|---|---|
| 09-B1 | 18 | 82 415 | pass | held the removal, gated the dialog with an `asked` field and wrote two contracts |
| 09-B2 | 12 | 75 484 | fail | a confirmation dialog appeared for the Done task while it was removed |

## Limits
- One R1 run, by an agent. R2 is two runs of one change.
- The hidden check for change 9 and the request script are trial 0023's. They are unchanged apart from ports (4940–4946)
  and a longer start-up wait, because the machine was loaded.
