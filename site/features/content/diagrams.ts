import { ui } from '@hozu/core'

const steps = [
  [
    'source',
    'Source',
    'Declare the intent',
    'Typed feature builders describe views, queries, events and behaviour. References point to declarations, not copied strings.',
  ],
  [
    'ir',
    'Feature IR',
    'Record the program',
    'The intermediate representation stores those declarations and their relationships. The same structure is available to every tool.',
  ],
  [
    'validator',
    'Validator',
    'Check the relationships',
    'Rules catch invalid references and unsafe data flow. Contracts exercise machine transitions against the intended result.',
  ],
  [
    'compiler',
    'Compiler',
    'Derive the plan',
    'Scope and freshness determine rendering regions. Machine bindings determine the islands that need client JavaScript.',
  ],
  [
    'runtime',
    'Runtime',
    'Execute the plan',
    'The server renders HTML and serializes data. The browser only hydrates the interactive islands that the plan calls for.',
  ],
] as const
export const pipelineDiagram = () =>
  ui.section({ 'data-explorer': '', 'aria-labelledby': 'pipeline-explorer-title' }, [
    ui.h2({ id: 'pipeline-explorer-title' }, ['Follow a feature through Hozu']),
    ui.p({}, [
      'Select a stage to see what it takes in and what it makes explicit. You can also use the arrow keys within the group.',
    ]),
    ui.svg(
      {
        role: 'img',
        viewBox: '0 0 640 90',
        'aria-label': 'Source flows into Feature IR, then validator, compiler and runtime.',
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
        'aria-label': 'Source, Feature IR, validator, compiler and runtime in sequence.',
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
      ui.legend({}, ['Pipeline stage']),
      ...steps.map(([id, title], index) =>
        ui.label({}, [
          ui.input({ type: 'radio', name: 'pipeline-stage', value: id, checked: index === 0 }),
          title,
        ]),
      ),
    ]),
    ...steps.map(([id, title, subtitle, body]) =>
      ui.div({ 'data-stage': id }, [ui.h3({}, [title, ': ', subtitle]), ui.p({}, [body])]),
    ),
  ])
export const renderDiagram = () =>
  ui.section({ 'data-render-explorer': '', 'aria-labelledby': 'render-explorer-title' }, [
    ui.h2({ id: 'render-explorer-title' }, ['Try a render plan']),
    ui.p({}, [
      'Change the declarations. This illustrates one query in a static shell; nested dependencies can make a region more dynamic.',
    ]),
    ui.fieldset({}, [
      ui.legend({}, ['Who can see this data?']),
      ui.label({}, [ui.input({ type: 'radio', name: 'scope', value: 'public', checked: true }), 'Public']),
      ui.label({}, [ui.input({ type: 'radio', name: 'scope', value: 'user' }), 'Signed-in user']),
    ]),
    ui.fieldset({}, [
      ui.legend({}, ['How fresh must it be?']),
      ...[
        ['static', 'Static'],
        ['isr', 'Revalidate'],
        ['swr', 'Stale while revalidate'],
        ['live', 'Live'],
      ].map(([id, title], index) =>
        ui.label({}, [
          ui.input({ type: 'radio', name: 'freshness', value: id!, checked: index === 0 }),
          title!,
        ]),
      ),
    ]),
    ui.svg(
      {
        role: 'img',
        viewBox: '0 0 640 90',
        'aria-label': 'Declared scope and freshness feed the compiler, which derives a render region.',
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
          'Scope + freshness',
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
          'Compiler',
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
          'Render region',
        ]),
      ],
    ),
    ui.svg(
      {
        role: 'img',
        viewBox: '0 0 300 210',
        'aria-label': 'Scope and freshness flow into the compiler and determine the render region.',
        'data-mobile-diagram': '',
      },
      ['Scope + freshness', 'Compiler', 'Render region'].map((label, index) =>
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
      [
        'static',
        'Static HTML',
        'Public, static data can be rendered ahead of time. A view without machine bindings ships no client application JavaScript.',
      ],
      [
        'isr',
        'Incremental static regeneration',
        'Public data uses the declared revalidation interval. The cached region can be regenerated by a server; this is not a GitHub Pages-only deployment.',
      ],
      [
        'swr',
        'Stale while revalidate',
        'Public cached data can be served while the server refreshes it. Cache policy follows the declaration rather than a route-level override.',
      ],
      [
        'live',
        'Request-time region',
        'Live freshness requires request-time data and the framework’s live transport. It cannot be exported as a static-only page.',
      ],
      [
        'user',
        'Private, request-time region',
        "User scope wins over every freshness choice. This data never reaches a shared cacheable region: a server reads it per request, or the browser reads it after the page loads (runs: 'browser').",
      ],
    ].map(([id, title, body]) =>
      ui.div({ 'data-render-result': id! }, [ui.h3({}, [title!]), ui.p({}, [body!])]),
    ),
    ui.p({ 'data-explorer-note': '' }, [
      'Hydration is a separate decision: only machine-bound nodes become islands. These controls are native HTML and use no JavaScript.',
    ]),
  ])
