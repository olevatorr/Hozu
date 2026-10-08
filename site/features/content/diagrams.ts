import { ui } from '@hozu/core'
import { contentText as t } from './messages.ts'

const steps = [
  ['source', t.stageSource, t.sourceTitle, t.sourceBody],
  ['ir', t.stageIr, t.irTitle, t.irBody],
  ['validator', t.stageValidator, t.validatorTitle, t.validatorBody],
  ['compiler', t.stageCompiler, t.compilerTitle, t.compilerBody],
  ['runtime', t.stageRuntime, t.runtimeTitle, t.runtimeBody],
] as const
export const pipelineDiagram = () =>
  ui.section({ 'data-explorer': '', 'aria-labelledby': 'pipeline-explorer-title' }, [
    ui.h2({ id: 'pipeline-explorer-title' }, [t.pipelineTitle]),
    ui.p({}, [t.pipelineIntro]),
    ui.svg(
      {
        role: 'img',
        viewBox: '0 0 640 90',
        'aria-label': t.pipelineAria,
        'data-diagram': '',
      },
      [
        ...steps.map((step, index) =>
          ui.g({}, [
            ui.rect(
              {
                x: index * 130,
                y: 14,
                width: 118,
                height: 52,
                rx: 8,
                fill: 'var(--color-paper)',
                stroke: 'var(--color-ink)',
              },
              [],
            ),
            ui.text(
              {
                x: index * 130 + 59,
                y: 46,
                'text-anchor': 'middle',
                fill: 'var(--color-ink)',
                'font-size': 15,
              },
              [step[1]],
            ),
            ...(index < 4
              ? [
                  ui.path(
                    {
                      d: `M${index * 130 + 120} 40h8m-4-4 4 4-4 4`,
                      stroke: 'var(--color-red)',
                      fill: 'none',
                    },
                    [],
                  ),
                ]
              : []),
          ]),
        ),
      ],
    ),
    ui.svg(
      {
        role: 'img',
        viewBox: '0 0 300 355',
        'aria-label': t.pipelineMobileAria,
        'data-mobile-diagram': '',
      },
      steps.map((step, index) =>
        ui.g({}, [
          ui.rect(
            {
              x: 40,
              y: index * 72,
              width: 220,
              height: 54,
              rx: 8,
              fill: 'var(--color-paper)',
              stroke: 'var(--color-ink)',
            },
            [],
          ),
          ui.text(
            {
              x: 150,
              y: index * 72 + 34,
              'text-anchor': 'middle',
              fill: 'var(--color-ink)',
              'font-size': 18,
            },
            [step[1]],
          ),
          ...(index < 4
            ? [
                ui.path(
                  { d: `M150 ${index * 72 + 57}v12m-5-5 5 5 5-5`, stroke: 'var(--color-red)', fill: 'none' },
                  [],
                ),
              ]
            : []),
        ]),
      ),
    ),
    ui.fieldset({ 'data-pipeline-controls': '' }, [
      ui.legend({}, [t.pipelineLegend]),
      ...steps.map(([id, title], index) =>
        ui.label({}, [
          ui.input({ type: 'radio', name: 'pipeline-stage', value: id, checked: index === 0 }),
          title,
        ]),
      ),
    ]),
    ...steps.map(([id, title, subtitle, body]) =>
      ui.div({ 'data-stage': id }, [ui.h3({}, [title, t.colon, subtitle]), ui.p({}, [body])]),
    ),
  ])
export const renderDiagram = () =>
  ui.section({ 'data-render-explorer': '', 'aria-labelledby': 'render-explorer-title' }, [
    ui.h2({ id: 'render-explorer-title' }, [t.renderTitle]),
    ui.p({}, [t.renderIntro]),
    ui.fieldset({}, [
      ui.legend({}, [t.whoSees]),
      ui.label({}, [
        ui.input({ type: 'radio', name: 'scope', value: 'public', checked: true }),
        t.scopePublic,
      ]),
      ui.label({}, [ui.input({ type: 'radio', name: 'scope', value: 'user' }), t.scopeUser]),
    ]),
    ui.fieldset({}, [
      ui.legend({}, [t.howFresh]),
      ...[
        ['static', t.freshStatic],
        ['isr', t.freshRevalidate],
        ['swr', t.freshSwr],
        ['live', t.freshLive],
      ].map(([id, title], index) =>
        ui.label({}, [
          ui.input({ type: 'radio', name: 'freshness', value: id as string, checked: index === 0 }),
          title as typeof t.freshLive,
        ]),
      ),
    ]),
    ui.svg(
      {
        role: 'img',
        viewBox: '0 0 640 90',
        'aria-label': t.renderAria,
        'data-diagram': '',
      },
      [
        ui.rect(
          {
            x: 0,
            y: 14,
            width: 210,
            height: 52,
            rx: 8,
            fill: 'var(--color-paper)',
            stroke: 'var(--color-ink)',
          },
          [],
        ),
        ui.text({ x: 105, y: 46, 'text-anchor': 'middle', fill: 'var(--color-ink)', 'font-size': 16 }, [
          t.scopeFreshness,
        ]),
        ui.path({ d: 'M218 40h38m-6-6 6 6-6 6', stroke: 'var(--color-red)', fill: 'none' }, []),
        ui.rect(
          {
            x: 266,
            y: 14,
            width: 130,
            height: 52,
            rx: 8,
            fill: 'var(--color-paper)',
            stroke: 'var(--color-ink)',
          },
          [],
        ),
        ui.text({ x: 331, y: 46, 'text-anchor': 'middle', fill: 'var(--color-ink)', 'font-size': 16 }, [
          t.stageCompiler,
        ]),
        ui.path({ d: 'M404 40h38m-6-6 6 6-6 6', stroke: 'var(--color-red)', fill: 'none' }, []),
        ui.rect(
          {
            x: 452,
            y: 14,
            width: 188,
            height: 52,
            rx: 8,
            fill: 'var(--color-paper)',
            stroke: 'var(--color-ink)',
          },
          [],
        ),
        ui.text({ x: 546, y: 46, 'text-anchor': 'middle', fill: 'var(--color-ink)', 'font-size': 16 }, [
          t.renderRegion,
        ]),
      ],
    ),
    ui.svg(
      {
        role: 'img',
        viewBox: '0 0 300 210',
        'aria-label': t.renderMobileAria,
        'data-mobile-diagram': '',
      },
      [t.scopeFreshness, t.stageCompiler, t.renderRegion].map((label, index) =>
        ui.g({}, [
          ui.rect(
            {
              x: 25,
              y: index * 72,
              width: 250,
              height: 54,
              rx: 8,
              fill: 'var(--color-paper)',
              stroke: 'var(--color-ink)',
            },
            [],
          ),
          ui.text(
            {
              x: 150,
              y: index * 72 + 34,
              'text-anchor': 'middle',
              fill: 'var(--color-ink)',
              'font-size': 18,
            },
            [label],
          ),
          ...(index < 2
            ? [
                ui.path(
                  { d: `M150 ${index * 72 + 57}v12m-5-5 5 5 5-5`, stroke: 'var(--color-red)', fill: 'none' },
                  [],
                ),
              ]
            : []),
        ]),
      ),
    ),
    ...[
      ['static', t.staticTitle, t.staticBody],
      ['isr', t.isrTitle, t.isrBody],
      ['swr', t.freshSwr, t.swrBody],
      ['live', t.liveTitle, t.liveBody],
      ['user', t.userTitle, t.userBody],
    ].map(([id, title, body]) =>
      ui.div({ 'data-render-result': id as string }, [
        ui.h3({}, [title as typeof t.freshLive]),
        ui.p({}, [body as typeof t.freshLive]),
      ]),
    ),
    ui.p({ 'data-explorer-note': '' }, [t.explorerNote({ poll: '{ poll: s }' })]),
  ])
