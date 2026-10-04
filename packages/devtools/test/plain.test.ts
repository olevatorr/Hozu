import type { DevNode } from '@hozu/core/ir'
import { describe, expect, it } from 'vitest'
import { describeFor, friendlyName, questionFor } from '../src/plain.ts'

const at = (file: string, line: number) => ({ file, line, column: 1 })
const node = (patch: Partial<DevNode>): DevNode => ({
  id: 'a.B/0',
  pointer: '/x',
  kind: 'element',
  tag: 'div',
  owner: { feature: 'a', view: 'B' },
  component: null,
  location: at('features/a/views.ts', 3),
  classes: null,
  text: null,
  source: null,
  events: [],
  conditions: [],
  machine: null,
  children: [],
  excerpt: null,
  page: null,
  ...patch,
})

describe('plain words for builders (owner, 2026-10-02)', () => {
  it('names things the way a person would', () => {
    expect(friendlyName(node({ tag: 'h1' }))).toBe('Heading')
    expect(friendlyName(node({ tag: 'a' }))).toBe('Link')
    expect(
      friendlyName(
        node({ tag: 'button', component: { ref: 'ui.Button', variant: {}, declaration: null, uses: 6 } }),
      ),
    ).toBe('Button')
    expect(friendlyName(node({ tag: 'section' }))).toBe('Area')
    expect(
      friendlyName(
        node({
          kind: 'text',
          tag: null,
          source: { kind: 'data', detail: 'x.y', location: null, uses: null },
        }),
      ),
    ).toBe('Text from your data')
    expect(
      friendlyName(
        node({
          kind: 'page',
          tag: null,
          page: {
            route: 'login',
            path: '/login',
            routeLocation: null,
            views: [],
            head: {
              title: 'Sign in',
              description: null,
              image: null,
              type: 'website',
              noindex: false,
              query: null,
            },
          },
        }),
      ),
    ).toBe('This page')
  })

  it('says what a change would reach, without ids or code words', () => {
    const lines = describeFor(
      node({
        tag: 'button',
        component: { ref: 'ui.Button', variant: {}, declaration: null, uses: 6 },
        children: [
          {
            id: 'x',
            kind: 'text',
            text: '',
            source: { kind: 'message', detail: 'a.signIn', location: null, uses: 2 },
          },
        ],
        events: [{ dom: 'submit', event: 'account.SignIn', transitions: [] }],
        conditions: [
          { kind: 'when', detail: 'state in signingIn | signingOut', location: null },
          { kind: 'each', detail: 'item of notes.listNotes', location: null },
        ],
      }),
    )
    expect(lines).toEqual([
      'A shared Button: the same design is used in 6 places.',
      'Its text is shared with 1 other place.',
      'One item of a list: changes apply to every item unless you say which.',
      'Shown only while signing in or signing out.',
      'When submitted, it does “Sign in”.',
    ])
  })

  it('asks the scope as a question', () => {
    expect(
      questionFor(
        node({ tag: 'button', component: { ref: 'ui.Button', variant: {}, declaration: null, uses: 6 } }),
      ),
    ).toEqual({
      question: 'Change this instance only, or the main component (every Button)?',
      options: { this: 'This instance only', component: 'Main component · every Button (6 places)' },
    })
    expect(
      questionFor(node({ conditions: [{ kind: 'each', detail: 'item of x', location: null }] })),
    ).toEqual({
      question: 'Change every item in the list, or only this one?',
      options: { items: 'Every item', this: 'Only this one' },
    })
    expect(questionFor(node({}))).toBeNull()
  })
})
