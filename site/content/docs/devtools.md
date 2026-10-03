---
title: Hozu DevTools
description: Point at the screen; give your agent a request that names the file, the line and the Hozu way to change it.
order: 10
---

## Start it

`npm run dev` starts the development server with Hozu DevTools: a small dock at the bottom of every page. Production builds never contain it, and it changes nothing in your code.

| Dock | What it does |
| --- | --- |
| Browse / Select | Use the app as usual, or click a part to select it (`Alt+Shift+S` switches) |
| Changes | The parts you described for this request, and the saved requests |
| Page | The page's title, description and other head fields |
| Layers | Every part of the page, and the states that are not on screen |
| Workbench | The page at an exact size: phone, tablet, laptop, or drag the corner |

## Describe a change

1. Choose **Select** and click what should change. Alt goes to the surrounding part; a double-click selects a text.
2. The inspector says what it is in plain words: a shared button used in six places, a text that comes from your data, a message shared by two places.
3. Write what should change. Try a style (size, weight, colours, spacing, corners) or other words (longer, Chinese, English) on the page first: it is a preview only.
4. Click the next part and describe it too. Every described part stays in the same request.
5. **Copy for AI** and paste it to your agent, or **Save request**, which writes `.hozu/requests/0007-….md` and copies the line to give the agent.

Each part of the request names its `file:line`, the scope you chose (only this one, every item, every use of a component), the theme class to use for a style, and a reminder only where a plain edit would go wrong.

## See every state

Layers lists the states the page can be in: loading, failed, empty, saving, a confirmation dialog, an error message. **Preview** shows one without running anything; the dock says so until you exit. A request made during a preview records the state.

## Try the data

**API** opens a drawer at the bottom (in the Workbench too) with the data the page reads and the changes it can make: where each one runs, how it is cached and the `file:line` that implements it. Edit the input in its row (it starts from what the page uses) and run it: you see the value as a table or JSON, or the declared error with an invalid field marked under it, and how long it took. A change asks in its row first, because it writes your development data; then the page re-reads what it invalidated, in place, as if a button on the page had made the change. History keeps the calls of this session, and **Copy as hozu call** hands one to your agent.

## Hand it to your agent

```sh
npx hozu requests --full      # every open request as one prompt
npx hozu requests done 7 --result "The heading is text-2xl"
```

Agents set up by `create-hozu` know the loop (`hozu docs requests`): read the requests, edit at each place, run `hozu check`, and close each one, which removes the file. Tell yours: “Do the open Hozu requests.”

## Builder or Developer

The settings switch between plain words (Builder, the default) and the source view (Developer): files, code excerpts, components, transitions and node ids. `npm run dev -- --devtools developer` starts in the source view. Light and dark follow your system.
