import { ui } from '@hozu/core'
import { devtools, doc } from '../../routes.ts'
import { Button } from '../../site/button.ts'
import { CodeBlock } from '../../site/code-block.ts'
import {
  apiDemo,
  assetsDemo,
  backDemo,
  designDemo,
  layersDemo,
  measureDemo,
  selectDemo,
} from '../../site/demos.ts'
import { Display, Heading } from '../../site/display.ts'
import { Section } from '../../site/section.ts'
import { Steps } from '../../site/steps.ts'
import { films } from './media.ts'

export const request = `# Hozu request: Make it bigger on phones and use the brand red

Page \`/\` · 390 × 844

## 1. <button> · ui.Button
- Want: Make it bigger on phones and use the brand red
- Where: \`features/tasks/views.ts:102:16\` (view \`tasks.Board\`)
- Scope: only this one
- Style: font size 14px → 16px: replace \`text-sm\` with \`text-base\`
- Style: background #111010 → #fb3a0e: replace \`bg-ink\` with \`bg-brand\`
- Mind: \`ui.Button\` is used in 6 places. For only this one, change \`class\` at this use; a property the component owns needs a trailing \`!\`.
- Locate: \`hozu why /features/tasks/views/Board/root/children/2/children/0/children/2\`

Run \`hozu check\` after the edits.`

const figma = [
  ['Shift+Enter · Enter · Tab', 'Select around it, inside it, beside it.'],
  ['Alt', 'Hold it and point: the distance in px.'],
  ['W × H', 'Every selection shows its size.'],
  ['Design panel', 'Frame, Auto layout, Layer, Fill, Stroke, Effects, Text.'],
  ['Variables', 'Tokens first: red · #fb3a0e, 2xl · 24px.'],
  ['Comments', 'Your agent’s notes are numbered pins: reply or resolve.'],
]

export const figmaCards = (frame: 'border-ink' | 'border-paper') =>
  ui.div(
    { class: 'mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3' },
    figma.map(([k, v]) =>
      ui.div({ class: `border-4 ${frame} p-4` }, [
        ui.h3({ class: 'font-mono text-sm font-bold' }, [k!]),
        ui.p({ class: 'mt-2' }, [v!]),
      ]),
    ),
  )

export const notes = `npx hozu show features/notes/views.ts:42 --note "Delete now asks before it removes a note"
npx hozu show features/notes/views.ts:51 --in "Buy milk" --note "Pinned notes go first"
npx hozu show page:home --note "The page title is shorter"`

const codeBlock = (text: string, frame: 'border-paper' | 'border-ink') =>
  ui.use(CodeBlock, {}, [
    ui.pre(
      {
        class: `overflow-x-auto border-4 ${frame} bg-ink p-5 font-mono text-xs leading-relaxed text-paper`,
        tabindex: 0,
      },
      [text],
    ),
  ])

export const DevToolsPage = ui.view({
  route: devtools,
  render: () =>
    ui.main({ id: 'main' }, [
      ui.div({ class: 'bg-paper' }, [
        ui.div(
          { class: 'mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1fr_1.2fr] lg:items-center' },
          [
            ui.div({}, [
              ui.p({ class: 'font-mono text-xs font-bold uppercase text-ember' }, ['Hozu DevTools']),
              ui.use(Display, {
                props: {
                  words: [
                    { id: '1', text: 'Point', accent: false },
                    { id: '2', text: 'at', accent: false },
                    { id: '3', text: 'it.', accent: false },
                    { id: '4', text: 'Your', accent: true },
                    { id: '5', text: 'agent', accent: true },
                    { id: '6', text: 'gets', accent: true },
                    { id: '7', text: 'the line.', accent: true },
                  ],
                },
              }),
              ui.p({ class: 'mt-5 max-w-md text-lg' }, [
                'Select what is wrong on the screen and say what should change. The request names the file, the line and the Hozu way to make the change, so your agent stops searching and starts fixing. When it is done, it points back: every part it changed gets a numbered frame on your page.',
              ]),
              ui.div({ class: 'mt-6 flex flex-wrap gap-3' }, [
                ui.use(Button, { props: { href: ui.link(doc, { slug: 'devtools' }) } }, ['Read the guide →']),
                ui.use(
                  Button,
                  {
                    variant: { intent: 'outline' },
                    props: { href: ui.link(doc, { slug: 'getting-started' }) },
                  },
                  ['npm run dev'],
                ),
              ]),
            ]),
            ui.video(
              {
                controls: true,
                preload: 'none',
                playsinline: true,
                poster: ui.asset(new URL('../../assets/video/hozu-devtools-poster.jpg', import.meta.url)),
                width: 1280,
                height: 720,
                'aria-label': 'Hozu DevTools in under two minutes',
                class:
                  'aspect-video h-auto w-full border-4 border-ink bg-ink shadow-[8px_8px_0_var(--color-ink)]',
              },
              [
                ui.source({
                  src: films.devtools,
                  type: 'video/mp4',
                }),
              ],
            ),
          ],
        ),
      ]),
      ui.use(Section, { props: { kicker: 'How it works' } }, [
        ui.use(Heading, {}, ['Three clicks, then it points back.']),
        ui.use(Steps, {
          class: 'mt-8 md:grid-cols-2! lg:grid-cols-4!',
          props: {
            items: [
              {
                id: '1',
                title: '1 · Select',
                body: 'Choose Select and click the part, with Figma’s keys: Shift+Enter goes up a level, Alt measures, a double-click picks a text.',
              },
              {
                id: '2',
                title: '2 · Describe',
                body: 'Say what should change. Try a size, a colour or other words first: it is a preview on your screen only.',
              },
              {
                id: '3',
                title: '3 · Hand it over',
                body: 'Copy for AI, or save it. Tell your agent: “Do the open Hozu requests.”',
              },
              {
                id: '4',
                title: '4 · See it back',
                body: 'Your agent frames each part it changed on your page, numbered, with a note in your words. Reply, or resolve it.',
              },
            ],
          },
        }),
        ui.div({ class: 'mt-8 w-full' }, [
          selectDemo(
            'Hozu DevTools on a task board: the Add task button is selected and the inspector shows it is a shared Button used in six places',
          ),
        ]),
      ]),
      ui.use(Section, { props: { kicker: 'Feels like Figma' } }, [
        ui.use(Heading, {}, ['Your Figma hands already know it.']),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
          'The same keys, the same measuring, the Design panel in the same order and your design tokens first. In Builder and in Developer alike.',
        ]),
        ui.div({ class: 'mt-8 grid gap-6 lg:grid-cols-2' }, [
          measureDemo(
            'The Add task button is selected and shows 136 × 40; holding Alt and pointing at nearby parts draws red lines with the distance in px',
          ),
          designDemo(
            'The Design panel in Figma’s order: changing Fill to red, Corner radius to full and Font size to base previews on the button and becomes the class to use',
          ),
        ]),
        figmaCards('border-ink'),
      ]),
      ui.use(Section, { props: { kicker: 'Assets' } }, [
        ui.use(Heading, {}, ['Every component on one page.']),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
          'No showcase page to write, no Storybook. Assets draws every component of your app, each variant and the states you named, from the app itself. See where each is used, frame its instances, and ask your agent to change the main component. Styles lists your tokens.',
        ]),
        ui.div({ class: 'mt-8' }, [
          assetsDemo(
            'Assets shows every component with its variants and named previews; opening Button lists where it is used, and a note to change the main component is added to the request',
          ),
        ]),
        ui.div({ class: 'mt-8 grid gap-4 md:grid-cols-2' }, [
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, ['previews.ts']),
            ui.p({ class: 'mt-2' }, [
              'Name the screens you care about: a long label, an empty list, a failed load, fifty rows. Each page screen answers its queries with your data, under npm run dev only.',
            ]),
          ]),
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, ['Never shipped']),
            ui.p({ class: 'mt-2' }, [
              'The build and the production server never load it, your agent leaves it alone unless asked, and hozu check says when a preview no longer fits the app.',
            ]),
          ]),
        ]),
      ]),
      ui.use(Section, { variant: { tone: 'ink' }, props: { kicker: 'The request' } }, [
        ui.use(Heading, {}, ['What your agent reads.']),
        ui.p({ class: 'mt-4 max-w-2xl' }, [
          'Where, what and how far the change reaches, the theme class to use, and a reminder only where a plain edit would go wrong. The pointer finds the part again after the lines move.',
        ]),
        ui.div({ class: 'mt-8 w-full' }, [codeBlock(request, 'border-paper')]),
      ]),
      ui.use(Section, { props: { kicker: 'The way back' } }, [
        ui.use(Heading, {}, ['See what your agent changed.']),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
          'After a change, your agent points at each part it touched, with a note in your words. You check the result on the page, not in a diff.',
        ]),
        ui.div({ class: 'mt-8 w-full' }, [
          backDemo(
            'Your agent runs hozu show twice: numbered red frames appear on the Add task button and on a list row, and the Agent panel steps through both notes',
          ),
        ]),
        ui.div({ class: 'mt-8 w-full' }, [codeBlock(notes, 'border-ink')]),
        ui.div({ class: 'mt-8 grid w-full gap-6 md:grid-cols-3' }, [
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, ['Numbered frames']),
            ui.p({ class: 'mt-2' }, [
              'Each part gets a red frame and a number. A file and line is enough; ',
              ui.code({ class: 'whitespace-nowrap font-mono text-sm' }, ['--in "<text>"']),
              ' picks one row of a list.',
            ]),
          ]),
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, ['Reply or resolve']),
            ui.p({ class: 'mt-2' }, [
              'The Agent panel steps through the notes. Send reply hands your answer back as a request; Resolve removes the note.',
            ]),
          ]),
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, ['Never out of date']),
            ui.p({ class: 'mt-2' }, [
              'hozu show lists the open notes and marks one stale when its part has moved or gone, so your agent fixes the note before you see it.',
            ]),
          ]),
        ]),
      ]),
      ui.use(Section, { props: { kicker: 'Every state' } }, [
        ui.use(Heading, {}, ['See the screens you never get to.']),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
          'Loading, failed, saving, an error message, a confirmation dialog: Layers lists every state the page can be in, read from the app itself. Preview one without running anything, at a phone’s exact size.',
        ]),
        ui.div({ class: 'mt-8' }, [
          layersDemo(
            'Layers lists the states of the page; previewing each one switches the phone-size page to loading, failed, a remove confirmation and saving',
          ),
        ]),
      ]),
      ui.use(Section, { props: { kicker: 'Your data' } }, [
        ui.use(Heading, {}, ['Test the API while you build it.']),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
          'API opens a drawer with what the page reads and what it can change: where each one runs, how it is cached and the line that implements it. Edit the input, run it and read the answer as a table. A change asks first, then the page updates in place, as if a button had made it.',
        ]),
        ui.div({ class: 'mt-8 grid w-full gap-6 md:grid-cols-3' }, [
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, ['What it sent']),
            ui.p({ class: 'mt-2' }, [
              'Every request a call sent out, from the server and the browser: headers, bodies, status, time. Copy it as curl.',
            ]),
          ]),
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, ['Your endpoints']),
            ui.p({ class: 'mt-2' }, [
              'Send a request to each endpoint you declared, with a body and your own headers, such as a bearer token.',
            ]),
          ]),
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, ['Act as anyone']),
            ui.p({ class: 'mt-2' }, [
              'Set this browser’s session to any user while developing, and see the page as they do.',
            ]),
          ]),
        ]),
        ui.div({ class: 'mt-8' }, [
          apiDemo(
            'The API drawer under the task board: running the Summary query shows its answer as a table and the request it sent; running Add task asks to confirm, then the page shows three to do',
          ),
        ]),
      ]),
      ui.use(Section, { variant: { tone: 'ink' }, props: { kicker: 'For everyone' } }, [
        ui.use(Heading, {}, ['Plain words, or the source.']),
        ui.div({ class: 'mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4' }, [
          ui.div({ class: 'border-4 border-paper p-5' }, [
            ui.h3({ class: 'text-xl font-black uppercase' }, ['Builder']),
            ui.p({ class: 'mt-2' }, [
              '“A shared Button: the same design is used in 6 places.” No code names, the scope as a question.',
            ]),
          ]),
          ui.div({ class: 'border-4 border-paper p-5' }, [
            ui.h3({ class: 'text-xl font-black uppercase' }, ['Developer']),
            ui.p({ class: 'mt-2' }, [
              'Files and excerpts, components, conditions, transitions and node ids.',
            ]),
          ]),
          ui.div({ class: 'border-4 border-paper p-5' }, [
            ui.h3({ class: 'text-xl font-black uppercase' }, ['Zero cost']),
            ui.p({ class: 'mt-2' }, [
              'Only under npm run dev. A production build carries no marker and no DevTools code.',
            ]),
          ]),
          ui.div({ class: 'border-4 border-paper p-5' }, [
            ui.h3({ class: 'text-xl font-black uppercase' }, ['Your language']),
            ui.p({ class: 'mt-2' }, [
              'One file translates every word of it, for you or your whole team: npx hozu devtools messages. What your agent reads stays English.',
            ]),
          ]),
        ]),
        ui.div({ class: 'mt-10 flex flex-wrap gap-4' }, [
          ui.use(
            Button,
            { variant: { intent: 'light' }, props: { href: ui.link(doc, { slug: 'devtools' }) } },
            ['Read the guide →'],
          ),
        ]),
      ]),
    ]),
})
