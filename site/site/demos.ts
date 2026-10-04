import { ui } from '@hozu/core'

type Child = Parameters<typeof ui.div>[1][number]

const d = (name: string, children: Child[] = []) => ui.div({ 'data-d': name }, children)
const s = (name: string, text: string) => ui.span({ 'data-d': name }, [text])

const cursor = () =>
  ui.svg({ 'data-d': 'cursor', viewBox: '0 0 14 20', width: 14, height: 20 }, [
    ui.path(
      {
        d: 'M1 1 L1 16 L4.6 12.6 L7.4 19 L10 17.9 L7.3 11.6 L12.4 11.6 Z',
        fill: '#111010',
        stroke: '#ffffff',
        'stroke-width': 1.2,
      },
      [],
    ),
  ])

const stage = (name: string, label: string, children: Child[]) =>
  ui.div({ 'data-demo': name, role: 'img', 'aria-label': label }, [
    ui.div({ 'data-d': 'stage', 'aria-hidden': 'true' }, [...children, d('veil')]),
  ])

const rows = ['Write the release notes', 'Fix the sign-in redirect', 'Design the empty states']

const board = () =>
  d('app', [
    s('kicker', 'STUDIO'),
    s('title', 'Team tasks'),
    d('stats', [
      d('stat', [s('k', 'To do'), s('v', '2')]),
      d('stat', [s('k', 'Doing'), s('v', '2')]),
      d('stat', [s('k', 'Done'), s('v', '1')]),
    ]),
    d('input', [s('ph', 'What needs doing?')]),
    d('add', [s('t', 'Add task')]),
    ...rows.map((r, i) =>
      ui.div({ 'data-d': 'row', 'data-i': String(i) }, [ui.span({}, [r]), s('pin', 'Pin')]),
    ),
  ])

const dock = (agent: boolean) =>
  d('dock', [
    s('logo', 'H'),
    s('pill', 'Browse'),
    s('select', 'Select'),
    s('pill', 'Changes'),
    s('pill', 'Layers'),
    s('pill', 'API'),
    ...(agent ? [d('agent', [ui.span({}, ['Agent']), s('n1', '1'), s('n2', '2')])] : []),
  ])

export const selectDemo = (label: string) =>
  stage('select', label, [
    board(),
    dock(false),
    d('hover', [s('tag', 'ui.Button'), s('size', '136 × 40')]),
    d('panel', [
      s('on', 'On /'),
      ui.p({ 'data-d': 'head' }, [ui.b({}, ['Button']), ' “Add task”']),
      s('h', 'About it'),
      ui.p({}, ['A shared Button: the same design is used in 6 places.']),
      s('file', 'features/tasks/views.ts:102'),
      s('h', 'Change'),
      d('radio', [s('on1', '● This instance only'), s('off1', '○ Main component · 6 places')]),
      d('field', [s('typed', 'Make it bigger on phones')]),
      d('copy', [s('a', 'Copy for AI'), s('b', 'Copied ✓')]),
    ]),
    d('click'),
    cursor(),
  ])

export const backDemo = (label: string) =>
  stage('back', label, [
    board(),
    dock(true),
    d('term', [
      s('l1', '$ hozu show views.ts:102'),
      s('l2', '   --note "Bigger on phones"'),
      s('l3', '✓ note 1 on /'),
      s('l4', '$ hozu show views.ts:118'),
      s('l5', '   --in "release" --note "Pinned first"'),
      s('l6', '✓ note 2 on /'),
    ]),
    d('f1', [s('b', '1'), s('n', 'Bigger on phones')]),
    d('f2', [s('b', '2'), s('n', 'Pinned first')]),
    d('panel', [
      d('p1', [
        s('h', 'Agent · 1 of 2'),
        ui.p({}, ['Bigger on phones']),
        s('file', 'features/tasks/views.ts:102'),
      ]),
      d('p2', [
        s('h', 'Agent · 2 of 2'),
        ui.p({}, ['Pinned first']),
        s('file', 'features/tasks/views.ts:118'),
      ]),
      d('btns', [s('btn', 'Back'), s('next', 'Next'), s('btn', 'Send reply'), s('done', 'Resolve')]),
    ]),
    d('click'),
    cursor(),
  ])

const states = ['Tasks ready', 'Loading summary', 'Summary failed', 'Confirm remove', 'Saving']

export const layersDemo = (label: string) =>
  stage('layers', label, [
    d('layers', [
      s('h', 'Layers · states of this page'),
      d('bar'),
      ...states.map((t, i) =>
        ui.div({ 'data-d': 'state', 'data-i': String(i) }, [ui.span({}, [t]), s('pv', 'Preview')]),
      ),
    ]),
    d('phone', [
      s('title', 'Team tasks'),
      d('stats', [d('stat', [s('v', '2')]), d('stat', [s('v', '2')]), d('stat', [s('v', '1')])]),
      ...rows.map((r) => d('row', [ui.span({}, [r])])),
      d('skeleton', [d('bone'), d('bone'), d('bone')]),
      d('alert', [s('t', 'Summary unavailable'), s('r', 'Try again')]),
      d('dialog', [
        ui.b({}, ['Remove “Write the release notes”?']),
        d('acts', [s('c', 'Cancel'), s('r', 'Remove')]),
      ]),
      d('saving', [s('t', 'Saving…')]),
    ]),
    d('badge', [
      s('b0', 'Preview · ready'),
      s('b1', 'Preview · loading'),
      s('b2', 'Preview · failed'),
      s('b3', 'Preview · confirming'),
      s('b4', 'Preview · saving'),
    ]),
    d('click'),
    cursor(),
  ])

export const apiDemo = (label: string) =>
  stage('api', label, [
    d('top', [
      s('title', 'Team tasks'),
      d('stats', [
        d('stat', [s('k', 'To do'), d('todo', [s('v2', '2'), s('v3', '3')])]),
        d('stat', [s('k', 'Doing'), s('v', '2')]),
        d('stat', [s('k', 'Done'), s('v', '1')]),
      ]),
    ]),
    d('drawer', [
      d('tabs', [s('on', 'API'), s('t', 'Reads 2'), s('t', 'Changes 1'), s('t', 'History')]),
      ui.div({ 'data-d': 'fx', 'data-i': '0' }, [
        ui.b({}, ['Summary']),
        s('kind', 'query · server'),
        s('run', 'Run ▶'),
      ]),
      ui.div({ 'data-d': 'fx', 'data-i': '1' }, [
        ui.b({}, ['List tasks']),
        s('kind', 'query · server'),
        s('run', 'Run ▶'),
      ]),
      ui.div({ 'data-d': 'fx', 'data-i': '2' }, [
        ui.b({}, ['Add task']),
        s('kind', 'mutation'),
        s('run', 'Run ▶'),
        s('confirm', 'Confirm'),
      ]),
      d('out', [
        d('read', [
          s('ok', 'OK · 12 ms · through the server'),
          ui.div({ 'data-d': 'cell', 'data-i': '0' }, [ui.span({}, ['todo']), ui.span({}, ['2'])]),
          ui.div({ 'data-d': 'cell', 'data-i': '1' }, [ui.span({}, ['doing']), ui.span({}, ['2'])]),
          ui.div({ 'data-d': 'cell', 'data-i': '2' }, [ui.span({}, ['done']), ui.span({}, ['1'])]),
          s('sent', 'Sent: POST /_hozu/query · 200 · 4 ms'),
        ]),
        d('wrote', [
          s('ok', 'OK · invalidated tasks · page re-read'),
          s('json', '{ id: "t6", title: "New task" }'),
        ]),
      ]),
    ]),
    d('click'),
    cursor(),
  ])

export const measureDemo = (label: string) =>
  stage('measure', label, [
    board(),
    dock(false),
    d('sel', [s('size', '136 × 40')]),
    d('key', [ui.kbd({}, ['Alt'])]),
    d('ta', [s('n', '20')]),
    d('tb', [s('n', '12')]),
    d('tc', [s('n', '16')]),
    d('click'),
    cursor(),
  ])

const field = (name: string, label: string, before: string, after?: string) =>
  ui.div({ 'data-d': 'fieldrow', 'data-f': name }, [
    ui.span({}, [label]),
    d('val', after ? [s('was', before), s('now', after)] : [s('was', before)]),
  ])

export const designDemo = (label: string) =>
  stage('design', label, [
    d('canvas', [d('card', [s('t', 'New task'), d('btn', [s('label', 'Add task')])])]),
    d('panel', [
      s('h', 'Design'),
      s('g', 'Frame'),
      field('w', 'W', '136'),
      field('hh', 'H', '40'),
      field('r', 'Corner radius', 'md · 6px', 'full · 9999px'),
      s('g', 'Auto layout'),
      field('gap', 'Gap', '2 · 8px'),
      field('pad', 'Padding', '4 · 16px'),
      s('g', 'Fill'),
      field('fill', 'Fill', 'ink · #111010', 'red · #fb3a0e'),
      s('g', 'Stroke'),
      field('stroke', 'Stroke weight', '0px'),
      s('g', 'Effects'),
      field('fx', 'Drop shadow', 'none'),
      s('g', 'Text'),
      field('size', 'Font size', 'sm · 14px', 'base · 16px'),
    ]),
    d('req', [s('l1', '- Style: background #111010 → #fb3a0e: replace `bg-ink` with `bg-red`')]),
    d('click'),
    cursor(),
  ])

const tile = (name: string, label: string, body: Child[]) =>
  ui.div({ 'data-d': 'tile', 'data-t': name }, [d('tbody', body), s('cap', label)])

export const assetsDemo = (label: string) =>
  stage('assets', label, [
    d('bar', [
      ui.b({}, ['Assets']),
      s('tab', 'Components'),
      s('tab2', 'Styles'),
      d('find', [s('q', 'Find a component…')]),
    ]),
    d('c1', [
      d('ct', [ui.b({}, ['Button']), s('u', '6 uses')]),
      tile('a', 'Default', [s('btn', 'Button')]),
      tile('b', 'tone: subtle', [s('btn2', 'Button')]),
      tile('c', '★ Long label', [s('btn', 'Save every note you wrote today')]),
    ]),
    d('c2', [
      d('ct', [ui.b({}, ['Field']), s('u', '4 uses')]),
      tile('d', 'Default', [s('lbl', 'Note'), d('inp')]),
      tile('e', '★ With an error', [s('lbl', 'Note'), d('inp'), s('err', 'Write something')]),
    ]),
    d('scr', [
      s('h', 'Screens'),
      d('srow', [ui.code({}, ['/']), ui.b({}, ['No notes']), s('open', 'Open')]),
      d('srow', [ui.code({}, ['/']), ui.b({}, ['Notes failed']), s('open', 'Open')]),
    ]),
    d('detail', [
      ui.b({}, ['Button']),
      s('file', 'ui/button.ts:16'),
      s('h', 'Variants'),
      ui.p({}, ['tone: primary, subtle, plain']),
      s('h', 'Where used'),
      d('chips', [s('chip', '/'), s('chip', '/login'), s('chip', '/admin')]),
      s('h', 'Change the main component'),
      d('area', [s('typed', 'Rounder corners everywhere')]),
      s('addreq', 'Add to the request'),
    ]),
    d('toast', [s('t', 'Added to the request · Main component · every Button')]),
    d('click'),
    cursor(),
  ])
