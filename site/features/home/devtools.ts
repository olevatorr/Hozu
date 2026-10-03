import { ui } from '@hozu/core'
import { devtools, doc } from '../../routes.ts'
import { Button } from '../../site/button.ts'
import { CodeBlock } from '../../site/code-block.ts'
import { Display, Heading } from '../../site/display.ts'
import { Section } from '../../site/section.ts'
import { Steps } from '../../site/steps.ts'

export const request = `# Hozu request: Make it bigger on phones and use the brand red

Page \`/\` · 390 × 844

## 1. <button> · ui.Button
- Want: Make it bigger on phones and use the brand red
- Where: \`features/tasks/views.ts:102:16\` (view \`tasks.Board\`)
- Scope: only this one
- Style: font size 14px → 16px: replace \`text-sm\` with \`text-base\`
- Style: background #111010 → #fb3a0e: replace \`bg-ink\` with \`bg-brand\`
- Mind: \`ui.Button\` is used in 6 places. For only this one, change \`class\` at this use; a property the component owns needs a trailing \`!\`.
- Locate: \`hozu locate /features/tasks/views/Board/root/children/2/children/0/children/2\`

Run \`hozu check\` after the edits.`

export const shot = (name: string, alt: string) =>
  ui.img({
    src: ui.asset(new URL(`../../assets/devtools-${name}.png`, import.meta.url)),
    width: 1440,
    height: 900,
    alt,
    class: 'w-full border-4 border-ink bg-white shadow-[8px_8px_0_var(--color-ink)]',
  })

const requestBlock = () =>
  ui.use(CodeBlock, {}, [
    ui.pre(
      {
        class:
          'overflow-x-auto border-4 border-paper bg-ink p-5 font-mono text-xs leading-relaxed text-paper',
        tabindex: 0,
      },
      [request],
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
              ui.p({ class: 'font-mono text-xs font-bold uppercase text-ember' }, ['Hozu DevTools · 0.10']),
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
                'Select what is wrong on the screen and say what should change. The request names the file, the line and the Hozu way to make the change, so your agent stops searching and starts fixing.',
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
            shot(
              'select',
              'Hozu DevTools on a task board: the Add task button is selected and the inspector shows it is a shared Button used in six places',
            ),
          ],
        ),
      ]),
      ui.use(Section, { props: { kicker: 'How it works' } }, [
        ui.use(Heading, {}, ['Three clicks instead of a paragraph.']),
        ui.use(Steps, {
          class: 'mt-8',
          props: {
            items: [
              {
                id: '1',
                title: '1 · Select',
                body: 'Choose Select in the dock and click the part. Alt goes up a level, a double-click picks a text.',
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
            ],
          },
        }),
      ]),
      ui.use(Section, { variant: { tone: 'ink' }, props: { kicker: 'The request' } }, [
        ui.use(Heading, {}, ['What your agent reads.']),
        ui.p({ class: 'mt-4 max-w-2xl' }, [
          'Where, what and how far the change reaches, the theme class to use, and a reminder only where a plain edit would go wrong. The pointer finds the part again after the lines move.',
        ]),
        ui.div({ class: 'mt-8 max-w-4xl' }, [requestBlock()]),
      ]),
      ui.use(Section, { props: { kicker: 'Every state' } }, [
        ui.use(Heading, {}, ['See the screens you never get to.']),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
          'Loading, failed, saving, an error message, a confirmation dialog: Layers lists every state the page can be in, read from the app itself. Preview one without running anything, at a phone’s exact size.',
        ]),
        ui.div({ class: 'mt-8' }, [
          shot(
            'workbench',
            'The Workbench: the task board at phone size showing the remove confirmation, with Layers and its other states on the left',
          ),
        ]),
      ]),
      ui.use(Section, { props: { kicker: 'Your data · 0.13' } }, [
        ui.use(Heading, {}, ['Test the API while you build it.']),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [
          'API opens a drawer with what the page reads and what it can change: where each one runs, how it is cached and the line that implements it. Edit the input, run it and read the answer as a table. A change asks first, then the page updates in place, as if a button had made it.',
        ]),
        ui.div({ class: 'mt-6 grid max-w-4xl gap-4 md:grid-cols-3' }, [
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
          shot(
            'api',
            'The API drawer docked under the task board: the Summary query ran through the server and its answer shows as a table, with the request the page sent listed below',
          ),
        ]),
      ]),
      ui.use(Section, { variant: { tone: 'ink' }, props: { kicker: 'For everyone' } }, [
        ui.use(Heading, {}, ['Plain words, or the source.']),
        ui.div({ class: 'mt-8 grid gap-6 md:grid-cols-3' }, [
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
