import { ui } from '@hozu/core'
import { doc, home } from '../../routes.ts'
import { Button } from '../../site/button.ts'
import { CodeBlock } from '../../site/code-block.ts'
import { Heading } from '../../site/display.ts'
import { Section } from '../../site/section.ts'
import { getPlayground, m, Pick } from './model.ts'

const choice =
  'border-4 border-paper px-3 py-2 font-mono text-xs font-bold aria-pressed:bg-paper aria-pressed:text-ink'
export const Play = ui.view({
  machine: m,
  route: home,
  render: ({ ctx }) =>
    ui.use(
      Section,
      { variant: { tone: 'ink', depth: 4 }, props: { label: 'Developers', kicker: '05 · Components · 0.9' } },
      [
        ui.use(Heading, {}, ['Declared UI. Checked class by class.']),
        ui.p({ class: 'mt-4 max-w-2xl' }, [
          'A button is a declaration in a kit, not a helper that disappears. Pick a variant: the preview, its source and what hozu render prints all come from the same component. This site is built from the same kit.',
        ]),
        ui.div({ class: 'mt-6 flex gap-3', role: 'group', 'aria-label': 'Button variant' }, [
          ui.button(
            {
              type: 'button',
              class: choice,
              'aria-pressed': ctx.intent === 'solid',
              on: { click: ui.send(Pick, { intent: 'solid' }) },
            },
            ['intent: solid'],
          ),
          ui.button(
            {
              type: 'button',
              class: choice,
              'aria-pressed': ctx.intent === 'outline',
              on: { click: ui.send(Pick, { intent: 'outline' }) },
            },
            ['intent: outline'],
          ),
        ]),
        ui.query(
          getPlayground,
          {},
          {
            ready: (play) =>
              ui.div({ class: 'mt-6 grid gap-6 lg:grid-cols-3' }, [
                ui.div({ class: 'grid place-items-center border-4 border-paper bg-paper p-8' }, [
                  ctx.intent === 'solid'
                    ? ui.use(Button, { variant: { intent: 'solid' }, props: { href: '#' } }, [
                        'Start building',
                      ])
                    : ui.use(Button, { variant: { intent: 'outline' }, props: { href: '#' } }, [
                        'Start building',
                      ]),
                ]),
                ui.div({ class: 'prose prose-invert min-w-0 max-w-none' }, [
                  ui.use(CodeBlock, {}, [ui.html(play.source)]),
                ]),
                ui.div({ class: 'min-w-0' }, [
                  ui.p({ class: 'font-mono text-xs font-bold text-red' }, [
                    'hozu render site.Button --variant intent=',
                    ctx.intent,
                  ]),
                  ui.pre(
                    {
                      class: 'mt-2 overflow-x-auto border-4 border-paper p-3 font-mono text-xs',
                      tabindex: 0,
                    },
                    [ctx.intent === 'solid' ? play.solid : play.outline],
                  ),
                ]),
              ]),
            pending: null,
            failed: { Unexpected: () => ui.p({ role: 'alert' }, ['The playground is unavailable.']) },
          },
        ),
        ui.p({ class: 'mt-6 max-w-2xl text-sm' }, [
          'Two classes that set one property on one element are reported as HZ079, so an override never wins by accident. ',
          ui.a({ href: ui.link(doc, { slug: 'views' }), class: 'underline decoration-red' }, [
            'Read about components',
          ]),
        ]),
      ],
    ),
})
