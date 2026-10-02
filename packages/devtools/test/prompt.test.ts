import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { DevNode } from '@hozu/core/ir'
import { describe, expect, it } from 'vitest'
import { joinRequests, openRequestsLine, requestMarkdown, scopesFor, titleOf } from '../src/prompt.ts'
import { parseTheme } from '../src/theme.ts'

const at = (file: string, line: number, column = 3) => ({ file, line, column })

const base: DevNode = {
  id: 'account.Login/2/1',
  pointer: '/features/account/views/Login/root/children/2/children/1',
  kind: 'element',
  tag: 'button',
  owner: { feature: 'account', view: 'Login' },
  component: {
    ref: 'ui.Button',
    variant: { tone: 'primary' },
    declaration: at('ui/button.ts', 16, 38),
    uses: 6,
  },
  location: at('features/account/views.ts', 38, 12),
  classes: 'rounded bg-indigo-600 px-4 py-2',
  text: null,
  source: null,
  events: [],
  conditions: [],
  machine: at('features/account/model.ts', 34),
  children: [
    {
      id: 'account.Login/2/1/0',
      kind: 'text',
      text: '"Sign in" · message account.signIn',
      source: {
        kind: 'message',
        detail: 'account.signIn',
        location: at('features/account/model.ts', 99),
        uses: 2,
      },
    },
  ],
  page: null,
  excerpt: {
    start: 37,
    lines: [
      '        }),',
      "        ui.use(Button, { props: { type: 'submit' } }, [text.signIn]),",
      '      ]),',
    ],
  },
}

const context = { path: '/login', viewport: { width: 1280, height: 800 }, preview: null }

const item = (node: DevNode, note: string, scope: 'this' | 'component' | 'items' = 'this') => ({
  node,
  note,
  scope,
  visible: '',
})

describe('the request an agent reads (ADR 0047 G2)', () => {
  it('is short: where, what, scope, and a reminder only where a plain edit would go wrong', () => {
    expect(requestMarkdown({ items: [item(base, 'Make it bigger')], context })).toBe(
      [
        '# Hozu request: Make it bigger',
        '',
        'Page `/login` · 1280 × 800',
        '',
        '## 1. <button> · ui.Button',
        '- Want: Make it bigger',
        '- Where: `features/account/views.ts:38:12` (view `account.Login`)',
        '- Scope: only this one',
        '- Mind: `ui.Button` is used in 6 places. For only this one, change `class` at this use; a property the component owns needs a trailing `!`.',
        '- Mind: its text is message `account.signIn` (`features/account/model.ts:99:3`), shared by 2 places; to change only this one, give it its own message.',
        '- Locate: `hozu locate /features/account/views/Login/root/children/2/children/1`',
        '',
        'Run `hozu check` after the edits.',
        '',
      ].join('\n'),
    )
  })

  it('adds the code excerpt only when asked', () => {
    const md = requestMarkdown({ items: [item(base, 'Bigger')], context }, { excerpt: true })
    expect(md).toContain('> 38 |         ui.use(Button')
    expect(md).toContain('  37 |         }),')
    expect(requestMarkdown({ items: [item(base, 'Bigger')], context })).not.toContain('```')
  })

  it('every use of a component points at the declaration', () => {
    const md = requestMarkdown({ items: [item(base, 'Rounder', 'component')], context })
    expect(md).toContain('- Scope: every Button like this (6 places)')
    expect(md).toContain(
      '- Mind: change the variant in `ui/button.ts:16:38`; all 6 uses change (`hozu impact ui.Button` lists them).',
    )
  })

  it('a plain element with literal text needs no reminder', () => {
    const node: DevNode = {
      ...base,
      id: 'account.Login/1',
      tag: 'h1',
      component: null,
      children: [
        {
          id: 'account.Login/1/0',
          kind: 'text',
          text: 'Sign in',
          source: { kind: 'literal', detail: 'Sign in', location: null, uses: null },
        },
      ],
    }
    const md = requestMarkdown({ items: [item(node, 'Smaller')], context })
    expect(md).toContain('## 1. <h1>')
    expect(md).not.toContain('- Mind:')
  })

  it('data text says to change the data, not the view', () => {
    const node: DevNode = {
      ...base,
      id: 'account.AccountBar/0/ready/1',
      kind: 'text',
      tag: null,
      component: null,
      text: 'account.me.name',
      source: {
        kind: 'data',
        detail: 'account.me.name',
        location: at('features/account/model.ts', 13),
        uses: null,
      },
      children: [],
    }
    const md = requestMarkdown({ items: [item(node, 'Show the full name')], context })
    expect(md).toContain('## 1. text from account.me.name')
    expect(md).toContain(
      '- Mind: the text comes from data `account.me.name` (query at `features/account/model.ts:13:3`): change the data or its formatting, not the view.',
    )
  })

  it('behaviour names the transition and the contract rule', () => {
    const node: DevNode = {
      ...base,
      id: 'account.Login/2',
      tag: 'form',
      component: null,
      children: [],
      events: [
        {
          dom: 'submit',
          event: 'account.SignIn',
          transitions: [
            {
              from: 'idle',
              to: 'signingIn',
              guarded: false,
              navigates: false,
              location: at('features/account/model.ts', 45),
            },
          ],
        },
      ],
    }
    expect(requestMarkdown({ items: [item(node, 'Also clear the name')], context })).toContain(
      '- Mind: `submit` sends `account.SignIn` (idle → signingIn at `features/account/model.ts:45:3`); a change of behaviour needs a contract when it decides (HZ016), otherwise `hozu check --update-lock`.',
    )
  })

  it('a list item says whether every item changes or the item needs data', () => {
    const node: DevNode = {
      ...base,
      component: null,
      conditions: [
        { kind: 'each', detail: 'item of notes.listNotes', location: at('features/notes/views.ts', 40) },
      ],
    }
    expect(scopesFor(node).map((s) => s.scope)).toEqual(['items', 'this'])
    expect(requestMarkdown({ items: [item(node, 'Bold', 'items')], context })).toContain(
      '- Mind: it is inside a list of `notes.listNotes` (`features/notes/views.ts:40:3`): every item changes.',
    )
    expect(requestMarkdown({ items: [item(node, 'Bold')], context })).toContain(
      '- Mind: one item of a list (`features/notes/views.ts:40:3`): changing only this one needs a field on the item that tells it apart.',
    )
  })

  it('a branch says when it is shown, and the preview the user saw is on the page line', () => {
    const node: DevNode = {
      ...base,
      component: null,
      conditions: [
        { kind: 'when', detail: 'state in signingIn', location: at('features/account/views.ts', 30) },
      ],
    }
    const md = requestMarkdown({
      items: [item(node, 'Spinner')],
      context: { ...context, preview: 'state signingIn' },
    })
    expect(md).toContain('Page `/login` · 1280 × 800 · preview state signingIn')
    expect(md).toContain('- Shown when: state in signingIn (`features/account/views.ts:30:3`)')
  })

  it('an empty description asks the agent to ask', () => {
    expect(requestMarkdown({ items: [item(base, '  ')], context })).toContain(
      '- Want: (not described: ask the user what should change)',
    )
  })

  it('a page names its route and the closed set of head fields', () => {
    const page: DevNode = {
      ...base,
      id: 'page:login',
      pointer: '/pages/login',
      kind: 'page',
      tag: null,
      owner: null,
      component: null,
      location: at('hozu.config.ts', 28, 5),
      children: [],
      excerpt: null,
      page: {
        route: 'login',
        path: '/login',
        routeLocation: at('routes.ts', 4),
        views: ['account.Login'],
        head: {
          title: 'Sign in',
          description: null,
          image: null,
          type: 'website',
          noindex: false,
          query: null,
        },
      },
    }
    const md = requestMarkdown({ items: [item(page, 'Add a description')], context })
    expect(md).toContain('## 1. page login')
    expect(md).toContain('- Where: `hozu.config.ts:28:5` (route `/login`, `routes.ts:4:3`)')
    expect(md).toContain(
      '- Mind: the head is a closed set of fields: title, description, type, image, published, noindex. Now: title “Sign in”, no description.',
    )
  })

  it('several selections are numbered, and the title names the first description and how many more', () => {
    const three = [
      item(base, 'Clear the name after signing in'),
      item(base, 'Shorter heading'),
      item(base, ''),
    ]
    expect(titleOf(three)).toBe('Clear the name after signing in + 2 more')
    expect(titleOf([item(base, ''), item(base, '')])).toBe('Change <button> · ui.Button + 1 more')
    const md = requestMarkdown({
      items: [
        item({ ...base, id: 'account.Login/1', tag: 'h1', component: null, children: [] }, ''),
        item(base, 'Bigger'),
      ],
      context,
    })
    expect(md).toContain('# Hozu request: Bigger + 1 more')
    expect(md).toContain('## 1. <h1>')
    expect(md).toContain('## 2. <button> · ui.Button')
    expect(
      titleOf([
        item(base, 'Make the sign in button much bigger and also change its colour to the brand red please'),
      ]),
    ).toBe('Make the sign in button much bigger and also change its…')
    expect(titleOf([item(base, ' ')])).toBe('Change <button> · ui.Button')
  })

  it('turns a live style edit into the theme utility that replaces the current one', () => {
    const css = createRequire(fileURLToPath(new URL('../../css/package.json', import.meta.url)))
    const theme = parseTheme(
      readFileSync(css.resolve('tailwindcss/theme.css'), 'utf8'),
      '@theme { --color-red: #fb3a0e; }',
    )
    const node: DevNode = { ...base, classes: 'rounded bg-indigo-600 px-4 py-2 text-white text-sm' }
    const md = requestMarkdown(
      {
        items: [
          {
            ...item(node, 'Bigger and red'),
            style: [
              { prop: 'fontSize', from: '14px', to: '24px' },
              { prop: 'backgroundColor', from: '#4f39f6', to: '#fb3a0e' },
              { prop: 'paddingInline', from: '16px', to: '22.5px' },
              { prop: 'fontWeight', from: '400', to: '700' },
            ],
          },
        ],
        context,
      },
      { theme },
    )
    expect(md).toContain('- Style: font size 14px → 24px: replace `text-sm` with `text-2xl`')
    expect(md).toContain('- Style: background #4f39f6 → #fb3a0e: replace `bg-indigo-600` with `bg-red`')
    expect(md).toContain(
      '- Style: padding left and right 16px → 22.5px: replace `px-4` with `px-[22.5px]` (nearest theme step `px-5.5`)',
    )
    expect(md).toContain('- Style: font weight 400 → 700: add `font-bold`')
    expect(
      requestMarkdown({
        items: [{ ...item(node, 'x'), style: [{ prop: 'fontSize', from: '14px', to: '24px' }] }],
        context,
      }),
    ).toContain('- Style: font size 14px → 24px')
  })

  it('the saved list gives the agent one line that points at the files, or every request in one prompt', () => {
    const list = [
      { number: '0007', file: '.hozu/requests/0007-a.md', title: 'Shorter heading + 1 more' },
      { number: '0008', file: '.hozu/requests/0008-b.md', title: 'Red button' },
    ]
    expect(openRequestsLine(list)).toBe(
      'Do the open Hozu requests: .hozu/requests/0007-a.md, .hozu/requests/0008-b.md. For each one: make the change where it says, run `hozu check`, then `hozu requests done <n> --result "<what changed>"`.',
    )
    const joined = joinRequests([
      { number: '0007', markdown: '# Hozu request: Shorter heading + 1 more\n\nbody 7\n' },
      { number: '0008', markdown: '# Hozu request: Red button\n\nbody 8\n' },
    ])
    expect(joined).toBe(
      [
        '# Hozu requests: 2 open',
        '',
        'Do each one below in order. Run `hozu check` after the edits.',
        '',
        '---',
        '',
        '# Hozu request 0007: Shorter heading + 1 more',
        '',
        'body 7',
        '',
        '---',
        '',
        '# Hozu request 0008: Red button',
        '',
        'body 8',
        '',
        '---',
        '',
        'When one is done: `hozu requests done <n> --result "<what changed>"` (0007, 0008).',
        '',
      ].join('\n'),
    )
  })
})
