---
title: Hozu DevTools
description: Point at the screen; give your agent a request that names the file, the line and the Hozu way to change it.
order: 11
---

## Start it

`npm run dev` starts the development server with Hozu DevTools: a small dock at the bottom of every page. Production builds never contain it, and it changes nothing in your code.

| Dock | What it does |
| --- | --- |
| Browse / Select | Use the app as usual, or click a part to select it (`Alt+Shift+S` switches) |
| Changes | The parts you described for this request, and the saved requests |
| Page | The page's title, description and other head fields |
| Layers | Every part of the page, the states that are not on screen, and the page's previews |
| Assets | Every component of the app on one board, and the design tokens |
| Frame | The page at an exact size: phone, tablet, laptop, or drag the corner |

## Describe a change

1. Choose **Select** and click what should change. The keys are Figma's: `Shift+Enter` selects the surrounding part, `Enter` the first part inside, `Tab` / `Shift+Tab` the next or previous part beside it, and a double-click selects a text. The selection shows its size, `W × H`.
2. The inspector says what it is in plain words: a shared button used in six places, a text that comes from your data, a message shared by two places.
3. Write what should change. Try a style or other words (longer, Chinese, English) on the page first: it is a preview only. The **Design** panel is Figma's, in its order: Frame (W, H, corner radius), Auto layout (gap, padding), Layer (opacity), Fill, Stroke, Effects (drop shadow) and Text. In Builder, a value shows its design token first (`2xl · 24px`, `red · #fb3a0e`); in Developer, the class (`text-2xl · 24px`).
4. Click the next part and describe it too. Every described part stays in the same request.
5. **Copy for AI** and paste it to your agent, or **Save request**, which writes `.hozu/requests/0007-….md` and copies the line to give the agent.

Each part of the request names its `file:line`, the scope you chose (this instance only, every item, or the main component: every use of it), the theme class to use for a style, and a reminder only where a plain edit would go wrong.

## Measure

Hold **Alt** and point, as in Figma: with a part selected, red lines show the distance in px to the part under the pointer (the gap between two parts, or the four insets when one holds the other); with nothing selected, the part under the pointer is measured against the part around it.

## Every component on one board

**Assets** opens a full-screen board with every component of the app: each variant on its own, rendered live with your stylesheet, and the named states from `previews.ts`. You do not write a showcase page. Click a component for its variants, properties, slots and `file:line`; **Where used** lists the pages, and **Show the instances** frames every use on this page (or opens a page that has one). **Change the main component** adds a request for every use to the current request. **Styles** shows the design tokens: colours, text sizes, corner radius and shadows.

## Screens with data you choose

`previews.ts` holds screens for people: a component in a named state, or a page whose queries answer with the data you give. Name it in `hozu.config.ts` with `previews: new URL('./previews.ts', import.meta.url)`:

```ts
import { previews } from '@hozu/core/preview'
import { me } from './features/account/model.ts'
import { listNotes } from './features/notes/model.ts'
import { home } from './routes.ts'
import { Button } from './ui/button.ts'

export default previews((p) => [
  p.component(Button, 'Long label', { variant: { tone: 'primary' }, children: 'Save every note you wrote today' }),
  p.page(home, 'No notes', [p.data(me, { name: 'ada' }), p.data(listNotes, [])]),
  p.page(home, 'Notes failed', [p.data(me, { name: 'ada' }), p.fail(listNotes, 'Unexpected')]),
])
```

**Layers → Previews** (or **Assets → Screens**) opens a screen; the dock shows it until you exit. While it is on, every page that reads those queries shows the preview data, and mutations still write. The file never ships: only `hozu dev` and `hozu check` load it, and a production server ignores the switch. `hozu check` reports a preview that no longer fits the app as HZ092. Your agent leaves the file alone unless you ask it to change a preview.

## See every state

Layers lists the states the page can be in: loading, failed, empty, saving, a confirmation dialog, an error message. **Preview** shows one without running anything; the dock says so until you exit. A request made during a preview records the state.

## Try the data

**API** opens a drawer at the bottom (in Frame too) with the data the page reads and the changes it can make: where each one runs, how it is cached and the `file:line` that implements it. Edit the input in its row (it starts from what the page uses) and run it: you see the value as a table or JSON, or the declared error with an invalid field marked under it, and how long it took. A change asks in its row first, because it writes your development data; then the page re-reads what it invalidated, in place, as if a button on the page had made the change. History keeps the calls of this session, and **Copy as hozu call** hands one to your agent.

Each row says whether it **reads** or **writes**; **JSON** sends any input, also one the schema rejects, to see the answer to a bad request. **Requests it sent** lists what a call really sent out, from the server and from the browser: the method, the URL, the headers and bodies both ways, the status and the time, with **Copy as curl** for a terminal, Postman or Bruno. When the app has sessions, **Act as** sets this browser's session to any value (development only). **Endpoints** sends a request to each declared endpoint with its path, query or JSON body, and your own headers, such as `Authorization: Bearer …`.

## Hand it to your agent

```sh
npx hozu requests --full      # every open request as one prompt
npx hozu requests done 7 --result "The heading is text-2xl"
```

Agents set up by `create-hozu` know the loop (`hozu docs requests`): read the requests, edit at each place, run `hozu check`, and close each one, which removes the file. Tell yours: “Do the open Hozu requests.”

## See what your agent changed

Your agent can point back. After a change it runs `hozu show` on the part it changed, with a note in your words:

```sh
npx hozu show features/notes/views.ts:42 --note "Delete now asks before it removes a note"
npx hozu show features/notes/views.ts:51 --in "Buy milk" --note "Pinned notes go first"
npx hozu show page:home --note "The page title is shorter"
```

The part gets a numbered red frame on your page, and an **Agent** button appears in the dock with the count. A long note is shortened on its frame: click the label to read it in full. Its panel shows each note in order, with Back and Next to step through them and scroll to each part. **Send reply** sends your answer back as a request; **Resolve** removes the note. A `file:line` needs no running dev server to find its part. `hozu show` alone lists the open notes and marks one `STALE` when its part has moved or gone. Notes live in `.hozu/notes.json` under `hozu dev` only: production builds never see them.

## Builder or Developer

The settings switch between plain words (Builder, the default) and the source view (Developer): files, code excerpts, components, transitions and node ids. `npm run dev -- --devtools developer` starts in the source view. Light and dark follow your system.
