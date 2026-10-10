# Trial 0023 — Do DevTools requests make an agent's changes cheaper? (ADR 0048)

**Question:** for the same small change on `examples/studio`, does an agent given a saved DevTools request (arm B)
instead of the person's sentence and the page address (arm A) finish as often, edit the right place first, and spend
fewer tool calls and tokens?

**Answer (one run per change and arm, Hozu 0.28.0 from npm, `claude-opus-5-5`, as amended in ADR 0048 "Run on 0.28"):**
- **Both arms land almost every change.** Arm A passed 10 of 10, arm B 9 of 10; every run left `hozu check` green.
  Primary target 1 is **missed**: B reached 9 but is one fewer than A.
- **B starts in the right file every time** (10 of 10, A 9 of 10): primary target 2 is **met**, read from the run's
  commands (below).
- **B is not much cheaper.** The geometric mean of B / A is **0.95×** for tool calls and **0.97×** for tokens
  (wall time 0.92×): both cost targets (0.70× / 0.85×) are **missed**. Totals: tool calls 90 → 85, tokens
  677 631 → 652 413.
- **What the request does buy is scope.** B kept "only this one" to the one use (1), ran `hozu requests done` every
  time, and read fewer files before its first write on the layout change (5: 9 against 15). A guessed scope
  wider once (1: it added a size to the shared button).
- **Reading (ADR 0048):** a primary target missed means the request format or the tool changes before it is called
  done; the cost result is reported with the table. On a small app with a short guide, an Opus agent finds the place
  from the sentence alone in a handful of calls, so a file and line save little. The request's value is in scope and
  in the states that are not on screen, which is where the findings below point.

## Per change
| # | Change | A | B | Tool calls A / B | Tokens A / B | First file A / B (reference) |
|---|---|---|---|---|---|---|
| 1 | Add task easier to tap on phones (this button only) | pass | pass | 8 / 8 | 65 400 / 63 455 | `ui/button.ts` / `views.ts` (`views.ts`) |
| 2 | Every primary button brand red | pass | pass | 9 / 11 | 67 021 / 65 542 | `ui/button.ts` / `ui/button.ts` |
| 3 | Remove dialog: task name bold | pass | pass | 6 / 6 | 61 344 / 63 263 | `views.ts` / `views.ts` |
| 4 | Counts failure says what to do | pass | pass | 5 / 4 | 59 773 / 59 985 | `views.ts` / `views.ts` |
| 5 | Long titles keep the row tidy on phones | pass | pass | 17 / 11 | 78 275 / 69 789 | `views.ts` / `views.ts` |
| 6 | Owner and date darker | pass | pass | 5 / 6 | 61 193 / 62 213 | `views.ts` / `views.ts` |
| 7 | "Removing <task>…" while removing | pass | pass | 14 / 14 | 77 912 / 68 772 | `views.ts` / `views.ts` |
| 8 | Shared preview gives status and due date | pass | pass | 8 / 6 | 66 166 / 61 682 | `hozu.config.ts` / `hozu.config.ts` |
| 9 | Remove a Done task at once | pass | **fail** | 11 / 12 | 77 912 / 75 380 | `model.ts` / `model.ts` |
| 10 | Search box wider on laptops | pass | pass | 7 / 7 | 62 635 / 62 332 | `views.ts` / `views.ts` |

- **9-B failed** on behaviour: the Done task was removed without a question, but the confirm dialog flashed open while
  removing (the `removing` state still rendered it). 9-A limited the dialog to the confirming state. Both wrote the
  contracts (`hozu check`: tasks 1/1) and accepted the lock.
- Runs 9-A and 9-B were the pilot; they were kept because nothing changed between them and the others.

## How the numbers were read
- **Pass:** the hidden checks in `~/hozu-trial-0023/checks` (computed styles, text, behaviour), 100 % on the
  reference first, plus `hozu check` green.
- **Tool calls, tokens, wall time:** the subagent's reported totals.
- **First file:** the subagents had no Edit tool in this harness and wrote through Bash (`sed -i`, scripts), so the
  first edit is the first Bash command that writes a source file, matched by its text. This is an approximation of
  "first Edit / Write"; the `.hozu/` request files and the lock are not counted.

## Findings in DevTools and the tools (for the next release)
| # | Finding | Where |
|---|---|---|
| D1 | A request about a style still carries the Mind line "change the data … not the view" | the request writer's Mind lines |
| D2 | A part in a state that is not on screen is described as "at an unknown place" | the request's Where |
| D3 | The Workbench "Laptop" size equals the default viewport, so a request made there names no size | Workbench presets |
| D4 | HZ018 asked for a contract per state a shared `on` is copied into (9-A, 9-B), where coverage counts the entry once | lock and contract coverage |
| D5 | `hozu browse` cannot target a button by name inside an overlay that is a plain `div` (7-A, 7-B) | browse targets |
| D6 | Three of the registered changes described what the app already did (ADR 0048 revision) | trial design |

## Limits
- One run per change and arm; a result near a threshold reads as undecided. Arm B lost on one change, so primary
  target 1 turns on a single run.
- The requests were saved by a script driving the real overlay, not by a person choosing what to select.
- The app is small and the agents strong: the result says little about a large app, where finding the place costs more.
