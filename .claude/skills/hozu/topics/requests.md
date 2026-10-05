# Requests from Hozu DevTools

- **Read every open one in one call:** `npx hozu requests --full` prints them as one prompt (saved under
  `.hozu/requests/`, or pasted to you).
- **Each item:** `Want` (the person's words), `Where` (`file:line:column` and the view), `Scope`, `Style`, `Text`,
  `Mind` (where a plain edit goes wrong), `Locate` (the IR pointer).
- **Do it:** edit at `Where`; when the lines moved, `npx hozu why <pointer>` finds the node again. Style: replace the
  named class with the given utility; never a `style` attribute. A behaviour change that decides needs a contract
  (`hozu docs contracts`).
- **Finish:** `npx hozu check`, then `npx hozu requests done <n> --result "<one line: what changed>"` for each one;
  it removes the file. Do not edit request files. Report the result lines to the person.
- **Show the person what changed:** `npx hozu show <views.ts:line | a Locate id | page:<route>> --note "<what changed,
  in their words>"` frames that part on their page under `npm run dev`; `--in "<text>"` picks one row of a list. A
  reply comes back as a request. `npx hozu show` lists the notes (a `STALE` one names a part that moved: re-add it),
  `--done <n>` removes one, `--clear` all.

<!-- more -->

- **The person's language:** DevTools may show their own translation (`hozu dev --devtools-messages <file>`,
  `HOZU_DEVTOOLS_MESSAGES`); the request Markdown you read is always English.
- **Where they come from:** under `npm run dev` (`hozu dev`) a person selects parts of the running app, describes the
  change, tries styles or text, and saves a request to `.hozu/requests/NNNN-<title>.md` or pastes it to you.
  `npx hozu requests` lists the numbers and places.
- **The other fields:**
  - `Scope`: only this one, every item of a list, or every use of a component;
  - `Style`: the class to replace and the theme utility to use;
  - `Text`: wording the person tried;
  - `Shown when`, and `preview <state>` on the page line: the state the person was looking at.
- **More on doing it:**
  - A component use: `class` at the use for this one (a property the component owns needs a trailing `!`), the
    variant in the kit for every use (`npx hozu why <ui.X>` lists them).
  - An arbitrary value (`px-[22px]`) only when the line says no theme step fits.
  - A message text changes in every locale; text from data changes the data or its formatting.
- **Notes (`hozu show`):** numbered in the order you add them, so several make a tour (Back / Next in the dock's Agent
  panel). The target is anything `hozu why` takes; `--page /path` says where it is when the target is not on the page
  the person has open. Notes live in `.hozu/notes.json` and never reach production.
- **The API drawer** (the dock's API button) lists the queries the page reads and the mutations its machines start,
  with `runs`, freshness, errors and the `file:line` that implements each, and runs them with an input the person
  edits (mutations ask first: they write development data; the page then re-reads in place). A request may carry a
  `npx hozu call …` line or a `curl` command (the requests a call sent out) copied from it. When a request says "this query returns X", reproduce it with
  `npx hozu call <feature>.<effect> --input '…'` before changing the resolver.
