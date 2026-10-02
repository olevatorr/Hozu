import type { DevNode } from '@hozu/core/ir'
import { describe, expect, it } from 'vitest'
import { requestJson, requestMarkdown, scopesFor, titleOf } from '../src/prompt.ts'

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

describe('the request an agent reads (ADR 0047 G2)', () => {
  it('names the file and line, the excerpt with the line marked, the component and both scopes', () => {
    const md = requestMarkdown({
      items: [{ node: base, note: 'Make it bigger', scope: 'this', visible: 'Sign in' }],
      context,
    })
    expect(md).toContain('# Hozu request: Make it bigger')
    expect(md).toContain('**Where:** `features/account/views.ts:38:12`')
    expect(md).toContain('> 38 |         ui.use(Button')
    expect(md).toContain('  37 |         }),')
    expect(md).toContain('`ui.Button`')
    expect(md).toContain('`ui/button.ts:16:38`')
    expect(md).toContain('only this one')
    expect(md).toContain('message `account.signIn`')
    expect(md).toContain('`features/account/model.ts:99:3`')
    expect(md).toContain('hozu check')
    expect(md).toContain('hozu render ui.Button')
    expect(md).toContain(`hozu browse /login --do 'click "Sign in"'`)
    expect(md).toContain('hozu locate /features/account/views/Login/root/children/2/children/1')
    expect(md).toContain('No inline `style`')
    expect(md).toContain('used in 2 places')
    expect(md).toContain('give this one its own message')
  })

  it('every use of a component points at the declaration and the impact command', () => {
    const md = requestMarkdown({
      items: [{ node: base, note: 'Rounder', scope: 'component', visible: '' }],
      context,
    })
    expect(md).toContain('every `ui.Button` (6 places)')
    expect(md).toContain('**Scope:** every Button like this (6 places)')
    expect(md).toContain('Change the variant in `ui/button.ts:16:38`')
    expect(md).toContain('hozu impact ui.Button')
  })

  it('data text says to change the data, not the view, and names the query', () => {
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
    const md = requestMarkdown({
      items: [{ node, note: 'Show the full name', scope: 'this', visible: 'otis' }],
      context,
    })
    expect(md).toContain('comes from data `account.me.name`')
    expect(md).toContain('`features/account/model.ts:13:3`')
  })

  it('a behaviour chip states the transition and the contract rule', () => {
    const node: DevNode = {
      ...base,
      id: 'account.Login/2',
      tag: 'form',
      component: null,
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
      children: [],
    }
    const md = requestMarkdown({
      items: [{ node, note: 'Also clear the name', scope: 'this', visible: '' }],
      context,
    })
    expect(md).toContain(
      'On `submit` it sends `account.SignIn`: `idle → signingIn` (`features/account/model.ts:45:3`)',
    )
    expect(md).toContain('needs a contract')
    expect(md).toContain('hozu check --update-lock')
  })

  it('an item inside a list says whether the change is for every item or needs data', () => {
    const node: DevNode = {
      ...base,
      component: null,
      conditions: [
        { kind: 'each', detail: 'item of notes.listNotes', location: at('features/notes/views.ts', 40) },
      ],
    }
    expect(scopesFor(node).map((s) => s.scope)).toEqual(['items', 'this'])
    const every = requestMarkdown({ items: [{ node, note: 'Bold', scope: 'items', visible: '' }], context })
    expect(every).toContain('every item of `notes.listNotes`')
    const one = requestMarkdown({ items: [{ node, note: 'Bold', scope: 'this', visible: '' }], context })
    expect(one).toContain('needs a field on the item')
  })

  it('several selections become one numbered request, and the JSON block carries pointers', () => {
    const request = {
      items: [
        { node: base, note: 'Bigger', scope: 'this' as const, visible: 'Sign in' },
        {
          node: { ...base, id: 'account.Login/1', tag: 'h1', component: null },
          note: '',
          scope: 'this' as const,
          visible: 'Sign in',
        },
      ],
      context,
    }
    const md = requestMarkdown(request)
    expect(md).toContain('## 1. Bigger')
    expect(md).toContain('## 2. Change <h1>')
    const json = requestJson(request)
    expect(json.items.map((i) => i.pointer)).toEqual([base.pointer, base.pointer])
    expect(md).toContain('```hozu-request')
    expect(JSON.parse(md.split('```hozu-request\n')[1]!.split('\n```')[0]!)).toEqual(json)
  })

  it('a page names its declaration and the closed set of head fields', () => {
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
    const md = requestMarkdown({
      items: [{ node: page, note: 'Add a description', scope: 'this', visible: '' }],
      context,
    })
    expect(md).toContain('**Where:** `hozu.config.ts:28:5` — page `login`')
    expect(md).toContain('This is page `login` (route `/login` at `routes.ts:4:3`)')
    expect(md).toContain('title, description, type, image, published, noindex')
    expect(md).toContain('title “Sign in”, no description')
    expect(md).toContain('`hozu get /login`')
  })

  it('titles come from the first note, cut at a word', () => {
    expect(
      titleOf([
        {
          node: base,
          note: 'Make the sign in button much bigger and also change its colour to the brand red please',
          scope: 'this',
          visible: '',
        },
      ]),
    ).toBe('Make the sign in button much bigger and also change its…')
    expect(titleOf([{ node: base, note: '  ', scope: 'this', visible: '' }])).toBe(
      'Change <button> · ui.Button',
    )
  })
})
