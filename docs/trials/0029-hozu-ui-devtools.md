# Trial 0029 — Hozu UI placed through DevTools, built by an agent (ADR 0089 §5)

**Question:** can a person who never reads code place official components on a page with DevTools, describe each in
their own words, and hand the saved request to an agent, which then installs, places and customises them correctly?

**Answer (1.0.0-rc.1 and `@hozu/ui-kit` 0.1.0 from local tarballs, `claude-opus-5-5`):**
- **Yes, 2 of 2.** Each builder got only the saved request ("Do the open Hozu requests.") and passed every hidden
  check, with `hozu check` clean and no file changed outside the app's own. Run 01 took 11 tool calls and 74 693
  tokens; run 02 took 12 tool calls and 79 281 tokens.
- **Preparing the trial found five faults first, and they were fixed before the runs.** That is where most of the
  value came from:
  - **Wrong kind of item:** *Change the main component* in Assets wrote a "this item of a list" item, so its Mind
    said to add a field instead of editing the component.
  - **Wrong `ui.use` hint:** the *Add* item told the agent to pass children to `Badge` and `EmptyState`, which take
    none and require `label` / `title`.
  - **Branches:** the request did not say that a query branch returns one node, so a sibling needs a wrapper.
  - **The scaffold broke a `--ui` app:** `hozu add feature` wrote Tailwind palette classes, which the kit's strict
    theme removes, so the first command after `create-hozu --ui` failed `hozu check` with six HZ026.
  - **Small ones:** anchors cut mid-word, and `hozu docs` did not list `ui`.

## The request (four items, saved through the real overlay by a script)
| # | What the person did in DevTools | Their note |
|---|---|---|
| 1 | Selected the heading → Assets → Hozu UI → Button, intent primary → *Place after* | "Add a big ‘New task’ button next to the title that takes people to the form" |
| 2 | Selected the list → Badge → *Place before* | "Show how many tasks are still open, like ‘3 open’" |
| 3 | Selected the list → EmptyState → *Place after* | "When there are no tasks, show a friendly ‘No tasks yet’ message instead of an empty list" |
| 4 | Assets → Button → *Change the main component* | "All buttons should have fully rounded, pill-shaped corners" |

## Hidden checks (validated: the reference passes all, the frozen app fails each item)
| Check | 01 | 02 |
|---|---|---|
| a. A primary kit button "New task" right after the heading, reaching the form | pass | pass |
| b. A kit Badge before the list with the open count, updated after *Mark done* | pass | pass |
| c. With every task removed, a kit EmptyState "No tasks yet" and no list (live and after a reload) | pass | pass |
| d. Every rendered kit button is pill-shaped | pass | pass |
| `hozu check` clean; files changed only under `features/`, `ui/`, the config and the lock | pass | pass |

## What the builders chose
Both runs made the same choices, independently:
- **`LinkButton`, not `Button`, for item 1:** the note asks to "take people to the form", and the guide's table says a
  link that looks like a button is `LinkButton`. Both share the styles, so item 4 reaches it.
- **A new `lg` size in `ui/button.ts`** for "a big button". The kit had only `sm` / `md`. This is the customisation
  the copy-in design allows, and both runs noted that `--sync` will now list the file as changed.
- **A `fn()` for the open count, and a `ui.div` around the list with its Badge and EmptyState,** as the request's Mind
  said.

## Limits
- Two runs of one request on one small app. The person is a script that follows a fixed path, not a person choosing.
- The harness itself needed one correction: the scope check compared against the frozen app's first commit, not its
  last (the tarballs were rebuilt after the fixes). Both runs were re-scored against the right commit.
- A placed component's tone (a prop, not a variant) cannot be chosen in DevTools. The request said "like ‘3 open’",
  and the Badge's tone was not scored.
