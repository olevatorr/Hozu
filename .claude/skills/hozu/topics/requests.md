# Requests from Hozu DevTools

- **Read every open one in one call:** `npx hozu requests --full` prints them as one prompt. Each one is saved
  under `.hozu/requests/`, also when it was pasted to you (its last line names the file and number).
- **Each item:** `Want` (the person's words), `Where` (`file:line:column` and the view), `Scope`, `Style`, `Text`,
  `Mind` (where a plain edit goes wrong), `Locate` (the IR pointer).
- **`Add <ui.X>` item:** run its `Install first` line, then the `Mind` line at `Where`. **`<ui.X> · Main
  component`:** edit its file; every use changes.
- **Do it:** edit at `Where`; when the lines moved, `npx hozu why <pointer>` finds the node again. Style: replace the
  named class with the given utility; never a `style` attribute. A behaviour change that decides needs a contract
  (`hozu docs contracts`).
- **Finish:** `npx hozu check`, then `npx hozu requests done <n> --result "<one line: what changed>"` for each one;
  it removes the file. Do not edit request files. Report the result lines to the person.
- **Show the person what changed:** `npx hozu show <views.ts:line | a Locate id | page:<route>> --note "<what changed,
  in their words>"` frames that part on their page under `npm run dev`; `--in "<text>"` picks one row of a list. A
  reply comes back as a request.

<!-- more -->

- **The person's language:** DevTools may show their own translation (`hozu dev --devtools-messages <file>`,
  `HOZU_DEVTOOLS_MESSAGES`); the request Markdown you read is always English.
- **Where they come from:** under `npm run dev` (`hozu dev`) a person selects parts of the running app, describes the
  change, tries styles or text, and saves a request to `.hozu/requests/NNNN-<title>.md` (Copy for AI saves it too,
  then they paste it to you).
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
- **Add and Main component items** come from DevTools' Assets board (Hozu UI and the app's components):
  - `## n. Add <ui.Button> { intent: 'primary' } after <button "Save">`: the person placed a component before, after
    or inside the selected part. `Install first` (only when the app lacks it) is `npx hozu add component ui Button
    --from official`; `Mind` names the file to import from and the `ui.use(…)` to write; `hozu docs ui` lists its
    props and slots. Dragged from an example, `Mind` names it (`ui/previews.ts:21`): copy that structure. With an
    icon, it names the export to import (a Lucide icon the app lacks is added to `ui/icons/lucide.ts` first).
  - `## n. <ui.Button> · Main component`: the person chose a component, not a part of the page. Change its `tv()`
    styles or render in its own file (`Where`); uses keep their own class overrides.
- **Notes (`hozu show`):** `npx hozu show` lists them (a `STALE` one names a part that moved: re-add it),
  `--done <n>` removes one, `--clear` all. They are numbered in the order you add them, so several make a tour
  (Back / Next in the dock's Agent panel). The target is anything `hozu why` takes; `--page /path` says where it is when the target is not on the page
  the person has open. Notes live in `.hozu/notes.json` and never reach production.
- **The API drawer** (the dock's API button) lists the queries the page reads and the mutations its machines start,
  with `runs`, freshness, errors and the `file:line` that implements each, and runs them with an input the person
  edits (mutations ask first: they write development data; the page then re-reads in place). A request may carry a
  `npx hozu call …` line or a `curl` command (the requests a call sent out) copied from it. When a request says "this query returns X", reproduce it with
  `npx hozu call <feature>.<effect> --input '…'` before changing the resolver.
