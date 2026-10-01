import { feature, ui } from '@hozu/core'
import { chapter, doc, how, trials } from '../../routes.ts'
import { listChapters } from '../content/model.ts'
import { content } from '../content/views.ts'
import { contracts, m, Run, SetBinding, SetContract, SetFreshness, SetScope } from './model.ts'

const code = (text: string) => ui.pre({ tabindex: 0 }, [ui.code({}, [text])])
export const How = ui.view({
  machine: m,
  route: how,
  render: ({ ctx, when }) =>
    ui.main({ id: 'main', 'data-lab': '' }, [
      ui.section({ 'data-lab-intro': '' }, [
        ui.div({}, [
          ui.p({ 'data-lab-kicker': '' }, ['Understand the design. Try the decisions.']),
          ui.h1({}, ['An idea goes in.\nA checked app comes out.']),
          ui.p({ 'data-lab-lede': '' }, [
            'Follow a feature through Hozu. Break a contract. Change the data rules. See what the framework can make explicit.',
          ]),
          ui.a({ href: '#pipeline-lab', 'data-button': '' }, ['Try the pipeline']),
          ui.a({ href: '#design-chapters', 'data-secondary': '' }, ['Read the design']),
        ]),
        ui.div({ 'data-lab-joint': '', 'aria-hidden': 'true' }, [
          ui.img({
            src: ui.asset(new URL('../../assets/logo.png', import.meta.url)),
            width: 256,
            height: 256,
            alt: '',
          }),
          ui.span({}, ['Intent']),
          ui.span({}, ['Structure']),
        ]),
      ]),
      ui.section({ id: 'pipeline-lab', 'data-workbench': '', 'aria-labelledby': 'pipeline-heading' }, [
        ui.div({ 'data-workbench-heading': '' }, [
          ui.div({}, [
            ui.p({ 'data-lab-kicker': '' }, ['Explore the pipeline']),
            ui.h2({ id: 'pipeline-heading' }, ['Make it. Check it. Then ship it.']),
          ]),
          ui.p({}, [
            'A preset walkthrough, powered by a real Hozu machine. It illustrates the design; it does not compile source in your browser.',
          ]),
        ]),
        ui.div({ 'data-workbench-grid': '' }, [
          ui.div({ 'data-source-pane': '' }, [
            ui.div({ 'data-pane-title': '' }, [ui.span({}, ['feature.ts']), ui.span({}, ['A small toggle'])]),
            code(
              "const Toggle = event({ payload: z.object({}) })\n\nconst m = machine({\n  context: z.object({}),\n  initialContext: {},\n  initial: 'off',\n  states: () => ({\n    off: { on: [on(Toggle, { target: 'on' })] },\n    on: { on: [on(Toggle, { target: 'off' })] },\n  }),\n})",
            ),
            ui.div({ 'data-contract-excerpt': '' }, [
              ui.div({ 'data-pane-title': '' }, [
                ui.span({}, ['contracts.ts']),
                ui.span({}, ['The off → on transition']),
              ]),
              ctx.missing === false
                ? code(
                    "contract(m, {\n  given: { state: 'off' },\n  when: [{ send: Toggle, payload: {} }],\n  expect: { state: 'on' },\n})",
                  )
                : ui.div({ 'data-missing-contract': '' }, [
                    ui.strong({}, ['Contract removed']),
                    ui.p({}, ['The transition still exists. Its expected behaviour is no longer covered.']),
                  ]),
              ui.p({ 'data-excerpt-note': '' }, [
                'Excerpts: imports, feature registration and the reverse-transition contract are omitted.',
              ]),
            ]),
          ]),
          ui.div({ 'data-execution-pane': '' }, [
            ui.ol({ 'data-execution-rail': '', 'aria-label': 'Pipeline stages' }, [
              ...[
                ['Source', 'Typed declarations', ['idle', 'source', 'brokenSource']],
                ['Feature IR', 'One shared representation', ['ir', 'brokenIr']],
                ['Validator', 'Rules and contracts', ['validated', 'blocked']],
                ['Compiler', 'Derived rendering', ['compiled']],
                ['Runtime', 'HTML and islands', ['done']],
              ].map(([title, description, states], index) =>
                ui.li({}, [
                  ui.span({ 'data-step-number': '' }, [String(index + 1)]),
                  ui.div({}, [ui.strong({}, [title as string]), ui.small({}, [description as string])]),
                  when(
                    states as (
                      | 'idle'
                      | 'source'
                      | 'brokenSource'
                      | 'ir'
                      | 'brokenIr'
                      | 'validated'
                      | 'blocked'
                      | 'compiled'
                      | 'done'
                    )[],
                    [ui.span({ 'data-step-current': '', 'aria-label': 'Current stage' }, ['●'])],
                  ),
                ]),
              ),
            ]),
            ui.div({ 'data-run-result': '', 'aria-live': 'polite', 'aria-atomic': 'true' }, [
              when(
                ['idle'],
                [
                  ui.p({ 'data-result-title': '' }, ['Your feature is ready.']),
                  ui.p({}, [
                    'Run the valid example first. Then remove its contract and find out where Hozu stops.',
                  ]),
                ],
              ),
              when(
                ['source', 'brokenSource'],
                [
                  ui.p({ 'data-result-title': '' }, ['Reading the declarations…']),
                  ui.p({}, ['Events, states and transitions describe the program before it executes.']),
                ],
              ),
              when(
                ['ir', 'brokenIr'],
                [
                  ui.p({ 'data-result-title': '' }, ['Recording the feature IR…']),
                  code('off ── Toggle ──▶ on\non  ── Toggle ──▶ off'),
                ],
              ),
              when(
                ['validated'],
                [
                  ui.p({ 'data-result-title': '' }, ['The behaviour is covered.']),
                  ui.p({}, ['The example has a contract for each transition. The pipeline can continue.']),
                ],
              ),
              when(
                ['compiled'],
                [
                  ui.p({ 'data-result-title': '' }, ['Deriving the render plan…']),
                  ui.p({}, [
                    'The machine-bound toggle becomes an interactive island. The surrounding content remains HTML.',
                  ]),
                ],
              ),
              when(
                ['done'],
                [
                  ui.div({ 'data-result-success': '' }, [
                    ui.p({ 'data-result-title': '' }, ['Ready to render.']),
                    ui.p({}, [
                      'The declarations, contracts and rendering plan agree. Now try removing the contract and run it again.',
                    ]),
                  ]),
                ],
              ),
              when(
                ['blocked'],
                [
                  ui.div({ 'data-result-error': '' }, [
                    ui.p({ 'data-result-title': '' }, ['Stopped at validation.']),
                    ui.code({}, ['HZ016 · uncovered transition']),
                    ui.p({}, [
                      'The off → on transition needs a contract. Restore its expected behaviour before continuing.',
                    ]),
                  ]),
                ],
              ),
            ]),
            ui.div({ 'data-run-controls': '' }, [
              ui.button({ type: 'button', 'data-lab-primary': '', on: { click: ui.send(Run, {}) } }, [
                'Run example',
              ]),
              ui.button(
                {
                  type: 'button',
                  'data-lab-secondary': '',
                  on: { click: ui.send(SetContract, { missing: ctx.missing === false }) },
                },
                [ctx.missing === false ? 'Remove contract' : 'Restore contract'],
              ),
              when(
                ['source', 'ir', 'validated', 'compiled', 'brokenSource', 'brokenIr'],
                [
                  ui.p({ 'data-run-progress': '', role: 'status' }, [
                    'Running… Controls unlock when this walkthrough finishes.',
                  ]),
                ],
              ),
            ]),
          ]),
        ]),
        ui.noscript({}, [
          ui.p({ 'data-lab-note': '' }, [
            'This walkthrough needs JavaScript. The six design chapters below explain the same pipeline without it.',
          ]),
        ]),
      ]),
      ui.section({ 'data-render-lab': '', 'aria-labelledby': 'render-heading' }, [
        ui.div({ 'data-render-intro': '' }, [
          ui.p({ 'data-lab-kicker': '' }, ['Explore the render plan']),
          ui.h2({ id: 'render-heading' }, ['You describe the data.\nHozu places the boundaries.']),
          ui.p({}, [
            'Change these declarations and watch the diagram respond. Caching and interactivity are separate decisions.',
          ]),
          ui.a({ href: ui.link(chapter, { slug: 'derived-rendering' }) }, ['Read about derived rendering']),
        ]),
        ui.div({ 'data-render-workspace': '' }, [
          ui.div({ 'data-render-settings': '' }, [
            ui.fieldset({}, [
              ui.legend({}, ['Data scope']),
              ...(['public', 'user'] as const).map((value) =>
                ui.button(
                  {
                    type: 'button',
                    'aria-pressed': ctx.scope === value,
                    on: { click: ui.send(SetScope, { value }) },
                  },
                  [value],
                ),
              ),
            ]),
            ui.fieldset({}, [
              ui.legend({}, ['Freshness']),
              ...(['static', 'revalidate', 'swr', 'live'] as const).map((value) =>
                ui.button(
                  {
                    type: 'button',
                    'aria-pressed': ctx.freshness === value,
                    on: { click: ui.send(SetFreshness, { value }) },
                  },
                  [value],
                ),
              ),
            ]),
            ui.fieldset({}, [
              ui.legend({}, ['Machine binding']),
              ...([false, true] as const).map((value) =>
                ui.button(
                  {
                    type: 'button',
                    'aria-pressed': ctx.binding === value,
                    on: { click: ui.send(SetBinding, { value }) },
                  },
                  [value ? 'Bound' : 'None'],
                ),
              ),
            ]),
          ]),
          ui.div({ 'data-render-preview': '', 'aria-live': 'polite', 'aria-atomic': 'true' }, [
            ui.div({ 'data-preview-bar': '' }, [
              ui.span({}, ['Your page']),
              ui.span({}, ['Render-plan illustration']),
            ]),
            ui.div({ 'data-preview-shell': '' }, [
              ui.div({ 'data-shell-label': '' }, [
                ui.span({}, ['Static shell']),
                ui.small({}, ['Navigation, headings, article']),
              ]),
              ui.div({ 'data-preview-data': '', toggle: { 'outline-4 outline-red': ctx.scope === 'user' } }, [
                ui.small({}, ['Query region']),
                ctx.scope === 'user'
                  ? [
                      ui.h3({}, ['Private · request-time']),
                      ui.p({}, ['Never in a shared cache. User scope takes priority over freshness.']),
                    ]
                  : [
                      ctx.freshness === 'static' && [
                        ui.h3({}, ['Static HTML']),
                        ui.p({}, ['Public, static data can be rendered ahead of time.']),
                      ],
                      ctx.freshness === 'revalidate' && [
                        ui.h3({}, ['ISR']),
                        ui.p({}, ['A server regenerates the cached region on its revalidation schedule.']),
                      ],
                      ctx.freshness === 'swr' && [
                        ui.h3({}, ['Stale while revalidate']),
                        ui.p({}, ['Serve cached public data while the server refreshes it.']),
                      ],
                      ctx.freshness === 'live' && [
                        ui.h3({}, ['Request-time data']),
                        ui.p({}, ['Live freshness needs a server and the framework’s live transport.']),
                      ],
                    ],
              ]),
              ui.div(
                { 'data-preview-island': '', toggle: { 'outline-4 outline-green': ctx.binding === true } },
                [
                  ctx.binding === true
                    ? [
                        ui.strong({}, ['Interactive island']),
                        ui.p({}, ['This machine-bound node needs client JavaScript.']),
                      ]
                    : [
                        ui.strong({}, ['Plain HTML']),
                        ui.p({}, ['No machine binding. This node does not hydrate.']),
                      ],
                ],
              ),
            ]),
            ui.div({ 'data-plan-summary': '' }, [
              ctx.scope === 'public' && ctx.freshness === 'static'
                ? ui.span({}, ['Data: static export possible'])
                : ui.span({}, ['Data: server required']),
              ctx.binding === true
                ? ui.span({}, ['Interaction: client JS'])
                : ui.span({}, ['Interaction: no hydration']),
            ]),
          ]),
          ui.p({ 'data-lab-note': '' }, [
            'This models one query in a static shell. Dependencies can make a region more dynamic. The controls update a local illustration; they do not fetch private or live data.',
          ]),
        ]),
      ]),
      ui.section({ id: 'design-chapters', 'data-design-chapters': '' }, [
        ui.div({}, [
          ui.p({ 'data-lab-kicker': '' }, ['Go a little deeper']),
          ui.h2({}, ['The reasoning behind the rules.']),
          ui.p({}, ['Six chapters, from the first design decision to the costs that remain.']),
        ]),
        ui.query(
          listChapters,
          {},
          {
            ready: (items) =>
              ui.ol({}, [
                ui.each(items, 'slug', (item) =>
                  ui.li({}, [
                    ui.a({ href: ui.link(chapter, { slug: item.slug }) }, [
                      ui.span({ 'data-chapter-number': '' }, [item.order]),
                      ui.div({}, [ui.h3({}, [item.title]), ui.p({}, [item.description])]),
                      ui.span({ 'aria-hidden': 'true', 'data-chapter-arrow': '' }, ['↗']),
                    ]),
                  ]),
                ),
              ]),
            pending: null,
            failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Chapters are unavailable.']) },
          },
        ),
        ui.div({ 'data-lab-next': '' }, [
          ui.a({ href: ui.link(doc, { slug: 'getting-started' }), 'data-button': '' }, [
            'Build your first feature',
          ]),
          ui.a({ href: ui.link(trials, null) }, ['Examine the measured results']),
        ]),
      ]),
    ]),
})
export const lab = feature({
  id: 'lab',
  intent: { summary: 'Interactive, explicitly illustrative walkthrough of Hozu validation and rendering' },
  imports: [content],
  declarations: [{ Run, SetContract, SetScope, SetFreshness, SetBinding, m, How, ...contracts }],
})
