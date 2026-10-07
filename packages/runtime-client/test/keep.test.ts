// @vitest-environment happy-dom
import type { MachineIR } from '@hozu/core/ir'
import { describe, expect, it } from 'vitest'
import type { PagePayload } from '../src/hydrate.ts'
import { kept } from '../src/keep.ts'
import type { App } from '../src/mount.ts'

const machine = (initialContext: Record<string, unknown>) =>
  ({
    context: 's',
    initialContext,
    initial: 'live',
    states: {
      live: { on: {}, ignore: [], invoke: null, after: [], final: false },
      saving: { invoke: { effect: 'x' } },
    },
  }) as unknown as MachineIR
const payload = (who: string | undefined, m: MachineIR, seeds?: string[]) =>
  ({
    features: { w: m },
    ...(who ? { who } : {}),
    ...(seeds ? { seeds: { w: seeds } } : {}),
  }) as unknown as PagePayload
const save = (snapshot: object, m: MachineIR, who = 'a', on: 'pagehide' | 'click' = 'pagehide') => {
  sessionStorage.clear()
  const apps = new Map([['w', { snapshot: () => snapshot } as unknown as App]])
  kept(document, payload(who, m), apps)
  if (on === 'click') document.body.click()
  else window.dispatchEvent(new Event('pagehide'))
}
const take = (p: PagePayload) => {
  let got: object | undefined
  kept(
    document,
    p,
    new Map([['w', { snapshot: () => null, resume: (s: object) => (got = s) } as unknown as App]]),
  )()
  return got
}

describe('state that stays on screen stays (ADR 0067 C4)', () => {
  it('keeps a calm snapshot for the next page of the same visitor, with the address winning', () => {
    const m = machine({ q: '', paused: false })
    save({ state: 'live', context: { q: 'old', paused: true }, entry: 3 }, m, 'a', 'click')
    expect(take(payload('a', machine({ q: 'park', paused: false }), ['q']))).toEqual({
      state: 'live',
      context: { q: 'park', paused: true },
      entry: 3,
    })
  })

  it('gives nothing back to another visitor, another machine, a busy state or twice', () => {
    const m = machine({ q: '' })
    save({ state: 'live', context: { q: 'x' }, entry: 1 }, m)
    expect(take(payload('b', m))).toBeUndefined()
    save({ state: 'live', context: { q: 'x' }, entry: 1 }, m)
    expect(take(payload('a', { ...m, initial: 'saving' } as MachineIR))).toBeUndefined()
    save({ state: 'saving', context: { q: 'x' }, entry: 1 }, m)
    expect(take(payload('a', m))).toBeUndefined()
    save({ state: 'live', context: { q: 'x' }, entry: 1 }, m)
    expect(take(payload('a', m))).toBeDefined()
    expect(take(payload('a', m))).toBeUndefined()
  })

  it('keeps nothing on a page that cannot know its visitor (a cacheable page of a session app)', () => {
    const m = machine({ q: '' })
    save({ state: 'live', context: { q: 'x' }, entry: 1 }, m, '')
    expect(take({ ...payload(undefined, m), who: null } as PagePayload)).toBeUndefined()
  })

  it('keeps nothing for a DevTools state preview or a reload', () => {
    const m = machine({ q: '' })
    save({ state: 'live', context: { q: 'x' }, entry: 1 }, m)
    expect(
      take({ ...payload('a', m), devState: { feature: 'w', state: 'live' } } as PagePayload),
    ).toBeUndefined()
    save({ state: 'live', context: { q: 'x' }, entry: 1 }, m)
    const entries = performance.getEntriesByType
    performance.getEntriesByType = () => [{ type: 'reload' }] as unknown as PerformanceEntryList
    try {
      expect(take(payload('a', m))).toBeUndefined()
    } finally {
      performance.getEntriesByType = entries
    }
  })
})
