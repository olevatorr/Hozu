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
import { Display, Heading, rise } from '../../site/display.ts'
import { Section } from '../../site/section.ts'
import { Step, Steps } from '../../site/steps.ts'
import { films } from './media.ts'
import { homeText as t } from './messages.ts'

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
  ['Shift+Enter · Enter · Tab', t.figmaSelect],
  ['Alt', t.figmaAlt],
  ['W × H', t.figmaSize],
  [t.figmaPanel, t.figmaPanelBody],
  [t.figmaVariables, t.figmaVariablesBody],
  [t.figmaComments, t.figmaCommentsBody],
] as const

export const figmaCards = (frame: 'border-ink' | 'border-paper') =>
  ui.div(
    { class: 'mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3' },
    figma.map(([k, v]) =>
      ui.div({ class: `border-4 ${frame} p-4` }, [
        ui.h3({ class: 'font-mono text-sm font-bold' }, [k]),
        ui.p({ class: 'mt-2' }, [v]),
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
              ui.use(Display, {}, [
                rise(t.dtWord1, false),
                rise(t.dtWord2, false),
                rise(t.dtWord3, false),
                rise(t.dtWord4, true),
                rise(t.dtWord5, true),
                rise(t.dtWord6, true),
                rise(t.dtWord7, true),
              ]),
              ui.p({ class: 'mt-5 max-w-md text-lg' }, [t.dtLead]),
              ui.div({ class: 'mt-6 flex flex-wrap gap-3' }, [
                ui.use(Button, { props: { href: ui.link(doc, { slug: 'devtools' }) } }, [t.dtGuide]),
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
                'aria-label': t.dtVideo,
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
      ui.use(Section, { props: { kicker: t.dtHowKicker } }, [
        ui.use(Heading, {}, [t.dtHowHeading]),
        ui.use(Steps, { class: 'mt-8 md:grid-cols-2! lg:grid-cols-4!' }, [
          ui.use(Step, { props: { title: t.dtStep1, body: t.dtStep1Body } }),
          ui.use(Step, { props: { title: t.dtStep2, body: t.dtStep2Body } }),
          ui.use(Step, { props: { title: t.dtStep3, body: t.dtStep3Body } }),
          ui.use(Step, { props: { title: t.dtStep4, body: t.dtStep4Body } }),
        ]),
        ui.div({ class: 'mt-8 w-full' }, [selectDemo(t.dtSelectDemo)]),
      ]),
      ui.use(Section, { props: { kicker: t.dtFigmaKicker } }, [
        ui.use(Heading, {}, [t.dtFigmaHeading]),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.dtFigmaLead]),
        ui.div({ class: 'mt-8 grid gap-6 lg:grid-cols-2' }, [
          measureDemo(t.designDemo),
          designDemo(t.dtDesignDemo),
        ]),
        figmaCards('border-ink'),
      ]),
      ui.use(Section, { props: { kicker: 'Assets' } }, [
        ui.use(Heading, {}, [t.dtAssetsHeading]),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.dtAssetsLead]),
        ui.div({ class: 'mt-8' }, [assetsDemo(t.dtAssetsDemo)]),
        ui.div({ class: 'mt-8 grid gap-4 md:grid-cols-2' }, [
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, ['previews.ts']),
            ui.p({ class: 'mt-2' }, [t.dtPreviewsBody]),
          ]),
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, [t.dtNeverShipped]),
            ui.p({ class: 'mt-2' }, [t.dtNeverShippedBody]),
          ]),
        ]),
      ]),
      ui.use(Section, { variant: { tone: 'ink' }, props: { kicker: t.dtRequestKicker } }, [
        ui.use(Heading, {}, [t.dtRequestHeading]),
        ui.p({ class: 'mt-4 max-w-2xl' }, [t.dtRequestLead]),
        ui.div({ class: 'mt-8 w-full' }, [codeBlock(request, 'border-paper')]),
      ]),
      ui.use(Section, { props: { kicker: t.dtBackKicker } }, [
        ui.use(Heading, {}, [t.dtBackHeading]),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.dtBackLead]),
        ui.div({ class: 'mt-8 w-full' }, [backDemo(t.dtBackDemo)]),
        ui.div({ class: 'mt-8 w-full' }, [codeBlock(notes, 'border-ink')]),
        ui.div({ class: 'mt-8 grid w-full gap-6 md:grid-cols-3' }, [
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, [t.dtFrames]),
            ui.p({ class: 'mt-2' }, [
              t.dtFramesA,
              ui.code({ class: 'whitespace-nowrap font-mono text-sm' }, ['--in "<text>"']),
              t.dtFramesB,
            ]),
          ]),
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, [t.dtReply]),
            ui.p({ class: 'mt-2' }, [t.dtReplyBody]),
          ]),
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, [t.dtFresh]),
            ui.p({ class: 'mt-2' }, [t.dtFreshBody]),
          ]),
        ]),
      ]),
      ui.use(Section, { props: { kicker: t.dtStatesKicker } }, [
        ui.use(Heading, {}, [t.dtStatesHeading]),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.dtStatesLead]),
        ui.div({ class: 'mt-8' }, [layersDemo(t.dtLayersDemo)]),
      ]),
      ui.use(Section, { props: { kicker: t.dtDataKicker } }, [
        ui.use(Heading, {}, [t.dtDataHeading]),
        ui.p({ class: 'mt-4 max-w-2xl text-lg' }, [t.dtDataLead]),
        ui.div({ class: 'mt-8 grid w-full gap-6 md:grid-cols-3' }, [
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, [t.dtSent]),
            ui.p({ class: 'mt-2' }, [t.dtSentBody]),
          ]),
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, [t.dtEndpoints]),
            ui.p({ class: 'mt-2' }, [t.dtEndpointsBody]),
          ]),
          ui.div({ class: 'border-4 border-ink p-4' }, [
            ui.h3({ class: 'font-black uppercase' }, [t.dtActAs]),
            ui.p({ class: 'mt-2' }, [t.dtActAsBody]),
          ]),
        ]),
        ui.div({ class: 'mt-8' }, [apiDemo(t.dtApiDemo)]),
      ]),
      ui.use(Section, { variant: { tone: 'ink' }, props: { kicker: t.dtEveryoneKicker } }, [
        ui.use(Heading, {}, [t.dtEveryoneHeading]),
        ui.div({ class: 'mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4' }, [
          ui.div({ class: 'border-4 border-paper p-5' }, [
            ui.h3({ class: 'text-xl font-black uppercase' }, ['Builder']),
            ui.p({ class: 'mt-2' }, [t.dtBuilderBody]),
          ]),
          ui.div({ class: 'border-4 border-paper p-5' }, [
            ui.h3({ class: 'text-xl font-black uppercase' }, ['Developer']),
            ui.p({ class: 'mt-2' }, [t.dtDeveloperBody]),
          ]),
          ui.div({ class: 'border-4 border-paper p-5' }, [
            ui.h3({ class: 'text-xl font-black uppercase' }, [t.dtZeroCost]),
            ui.p({ class: 'mt-2' }, [t.dtZeroCostBody]),
          ]),
          ui.div({ class: 'border-4 border-paper p-5' }, [
            ui.h3({ class: 'text-xl font-black uppercase' }, [t.dtLanguage]),
            ui.p({ class: 'mt-2' }, [t.dtLanguageBody]),
          ]),
        ]),
        ui.div({ class: 'mt-10 flex flex-wrap gap-4' }, [
          ui.use(
            Button,
            { variant: { intent: 'light' }, props: { href: ui.link(doc, { slug: 'devtools' }) } },
            [t.dtGuide],
          ),
        ]),
      ]),
    ]),
})
