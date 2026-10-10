# ADR 0048 — Trial 0023: do DevTools requests make a vibe coder's changes cheaper? (pre-registration)

- Status: deferred (owner, 2026-10-02): 0.10.0 is released first; the trial runs before 1.0.0, as part of the gate in
  ADR 0080 (which replaced the feedback round with people it waited for, 2026-10-10). The design and targets are
  reviewed and frozen before that run, then not changed after it starts.
- **Why:** ADR 0047 G2 and G3. The tests prove that a request names the right file, line and form. They do not prove
  that an agent given one spends less and lands the change more often than an agent given the same sentence alone.
- **Question:** for the same small change on the same app, does an agent given a DevTools request (arm B) instead of
  the person's sentence and the page address (arm A):
  - finish it at least as often;
  - edit the right place first;
  - use fewer tool calls and tokens?

## Options considered
1. **The same sentence with and without the DevTools request, one change per session, n = 1 (chosen).** The only
   difference between the arms is what the tool adds.
2. **A screenshot arm.** Deferred: ADR 0047 rejected screenshots by default; a third arm adds cost for a question
   the first two do not ask.
3. **Cumulative steps as in trial 0021.** Rejected: a failure in one step would change every later one, and the
   changes here are independent.
4. **Three runs per change.** Deferred to keep the cost down; a result near a threshold reads as undecided.

## Design
- **The app:** `examples/studio` at the commit that freezes the trial, copied to `~/hozu-trial-0023`; 0.10.0 tarballs
  packed from that commit, their SHA-256 recorded. Every session starts from the same copy.
- **The runner:** one `claude -p` session per change and arm, `claude-opus-5-5`, the skill written by `create-hozu
  --agent claude`, instruction fingerprints recorded; never repaired; a void re-runs from the same copy.
- **Arm A:** the prompt is the person's sentence and the page address, nothing else.
- **Arm B:** the prompt is "Do the open Hozu requests." with one saved request in `.hozu/requests/`, made with the real
  DevTools on the frozen app: the trial author selects the part named in a scripted path (recorded per change),
  writes the same sentence as Want and saves. Previews, style and text edits are used only where the path says so.
- **The sentences** are written in product language by an isolated session that sees neither ADR 0047 nor the
  DevTools code. Its brief is the table below.

| # | Change (brief for the author) | What it probes |
|---|---|---|
| 1 | The "Add task" button looks too small on phones | a component use, scope "only this one" |
| 2 | Every primary button should use the brand red | scope "every use", a variant |
| 3 | The remove dialog title is hard to read: make the task name bold | a state that is not on screen |
| 4 | The "Counts are unavailable" message should say what to do | a branch that is not on screen, copy |
| 5 | Long task titles break the row on phones | text preview, layout |
| 6 | The owner and date are too light to read | a style on a list item, every item |
| 7 | "Saving…" should say which task is being saved | context text in a busy state |
| 8 | The detail page should show the title as the browser tab title | page head |
| 9 | "Move" should go straight to Done for tasks that are Doing | behaviour: a deciding change and its contract |
| 10 | The search box should be wider on laptops | a Workbench size in the request |

- **Acceptance:** hidden browser checks per change on computed styles, text and behaviour, written and validated on
  a reference implementation before the runs (100 % there); `hozu check` must be green.

## Registered targets
- **Primary:**
  1. Arm B passes at least 9 of 10 changes, and never fewer than arm A.
  2. **First edit in the right place:** arm B's first source edit is in the file the reference changes in at least
     9 of 10; reported for both arms.
- **Cost:** over the ten changes, the geometric mean of B / A is at most **0.70×** for tool calls and at most
  **0.85×** for weighted tokens.
- **Secondary:** files read before the first edit; changes where the agent followed a Mind line (scope, message,
  contract); wall time; every diagnostic met, with how it was fixed.
- **Reading the result:** a primary target missed means the request format or the tool changes before 0.10 is called
  done; a cost target missed is reported with the per-change table and the turns where the difference came from.

## Budget
- 20 sessions plus the reference and its validation; about the cost of trial 0021's eight held-out steps.

## Run on 0.28 (2026-10-10, ADR 0080 D)
The trial runs as registered above, on Hozu 0.28.0, with these changes, each fixed before any run:
| Registered | As run | Why |
|---|---|---|
| 0.10.0 tarballs packed from the freezing commit | `@hozu/*@0.28.0` from npm, exact versions in `package.json` and a committed lockfile | The published packages are what people install; their provenance replaces the tarball hashes |
| One `claude -p` session per run | One isolated subagent per run (`claude-opus-5-5`, no shared context), started by the lead with only the arm's prompt | The lead's harness; each run still starts from the same copy and sees nothing else |
| Weighted tokens | The subagent's reported token total | The harness reports one total per run; the cost target reads it the same way for both arms |
| Requests saved by the trial author through DevTools | Saved through the real DevTools overlay under `hozu dev` on the frozen copy (port 4840), driven over the Chrome DevTools Protocol by a script that follows each change's scripted path, then committed with the copy | The same overlay code and request format; a script makes the path repeatable and is committed with the requests |
| The designer role of ADR 0081 | Arm B is the designer role: its only input is what DevTools produced | ADR 0080 A3 shares this trial |

Every other part (the ten changes, isolated sentence author, acceptance checks validated on a reference first,
targets, reading the result) is unchanged. The record goes to `docs/trials/0023-devtools.md`.
