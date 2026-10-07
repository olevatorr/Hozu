// @vitest-environment happy-dom
import type { MachineIR } from '@hozu/core/ir'
import { describe, expect, it } from 'vitest'
import { kept, type PagePayload } from '../src/hydrate.ts'
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
const save = (snapshot: object, m: MachineIR, who = 'a') => {
  sessionStorage.clear()
  const apps = new Map([['w', { snapshot: () => snapshot } as unknown as App]])
  kept(document, payload(who, m), apps)
  window.dispatchEvent(new Event('pagehide'))
}

describe('state that stays on screen stays (ADR 0067 C4)', () => {
  it('keeps a calm snapshot for the next page of the same visitor, with the address winning', () => {
    const m = machine({ q: '', paused: false })
    save({ state: 'live', context: { q: 'old', paused: true }, entry: 3 }, m)
    const take = kept(document, payload('a', machine({ q: 'park', paused: false }), ['q']), new Map())
    expect(take('w', machine({ q: 'park', paused: false }))).toEqual({
      state: 'live',
      context: { q: 'park', paused: true },
      entry: 3,
    })
  })

  it('gives nothing back to another visitor, another machine, a busy state or twice', () => {
    const m = machine({ q: '' })
    save({ state: 'live', context: { q: 'x' }, entry: 1 }, m)
    expect(kept(document, payload('b', m), new Map())('w', m)).toBeUndefined()
    save({ state: 'live', context: { q: 'x' }, entry: 1 }, m)
    const other = { ...m, initial: 'saving' } as MachineIR
    expect(kept(document, payload('a', other), new Map())('w', other)).toBeUndefined()
    save({ state: 'saving', context: { q: 'x' }, entry: 1 }, m)
    expect(kept(document, payload('a', m), new Map())('w', m)).toBeUndefined()
    save({ state: 'live', context: { q: 'x' }, entry: 1 }, m)
    kept(document, payload('a', m), new Map())
    expect(kept(document, payload('a', m), new Map())('w', m)).toBeUndefined()
  })

  it('keeps nothing for a DevTools state preview', () => {
    const m = machine({ q: '' })
    save({ state: 'live', context: { q: 'x' }, entry: 1 }, m)
    const preview = { ...payload('a', m), devState: { feature: 'w', state: 'live' } } as PagePayload
    expect(kept(document, preview, new Map())('w', m)).toBeUndefined()
  })
})
