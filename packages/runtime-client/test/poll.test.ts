import { afterEach, describe, expect, it, vi } from 'vitest'
import { poll } from '../src/poll.ts'

const doc = { visibilityState: 'visible' } as Document

describe('poll (ADR 0063 C1)', () => {
  afterEach(() => vi.useRealTimers())

  it('reads again only the keys a mounted region shows, for any input, and keeps going past a failure', async () => {
    vi.useFakeTimers()
    const data = new Map<string, string>([
      ['q.quotes{"symbols":["A"]}', 'old A'],
      ['q.quotes{"symbols":["B"]}', 'old B'],
      ['q.price"A"', 'old price'],
      ['q.other{}', 'other'],
    ])
    const shown = ['q.quotes{"symbols":["A"]}', 'q.price"A"', 'q.other{}']
    const reads: [string, unknown][] = []
    let syncs = 0
    poll(
      doc,
      { 'q.quotes': 30, 'q.price': 30 },
      { data, versions: new Map() },
      async (ref, input) => {
        reads.push([ref, input])
        if (ref === 'q.price') throw new Error('offline')
        return `new ${JSON.stringify(input)}`
      },
      () => 0,
      () => {
        syncs++
        for (const key of shown) data.get(key)
      },
    )
    await vi.advanceTimersByTimeAsync(30_000)
    expect(reads).toEqual([
      ['q.quotes', { symbols: ['A'] }],
      ['q.price', 'A'],
    ])
    expect(data.get('q.quotes{"symbols":["A"]}')).toBe('new {"symbols":["A"]}')
    expect(data.get('q.quotes{"symbols":["B"]}')).toBe('old B')
    expect(data.get('q.price"A"')).toBe('old price')
    expect(syncs).toBe(2)
    expect(Object.hasOwn(data, 'get')).toBe(false)
  })

  it('drops an answer when an effect started or refreshed the key meanwhile, and skips hidden pages', async () => {
    vi.useFakeTimers()
    const key = 'q.quotes{}'
    const data = new Map([[key, 'old']])
    const versions = new Map<string, number>()
    let busy = 0
    let hidden = false
    const page = {
      get visibilityState() {
        return hidden ? 'hidden' : 'visible'
      },
    } as Document
    let reads = 0
    poll(
      page,
      { 'q.quotes': 10 },
      { data, versions },
      async () => {
        reads++
        busy = 1
        return 'polled'
      },
      () => busy,
      () => data.get(key),
    )
    await vi.advanceTimersByTimeAsync(10_000)
    expect(data.get(key)).toBe('old')
    busy = 0
    hidden = true
    await vi.advanceTimersByTimeAsync(10_000)
    expect(reads).toBe(1)
  })
  it('starts no round while the last one still reads', async () => {
    vi.useFakeTimers()
    const key = 'q.quotes{}'
    const data = new Map([[key, 'old']])
    let reads = 0
    poll(
      doc,
      { 'q.quotes': 5 },
      { data, versions: new Map() },
      () => {
        reads++
        return new Promise<string>((resolve) => setTimeout(() => resolve('slow'), 12_000))
      },
      () => 0,
      () => data.get(key),
    )
    await vi.advanceTimersByTimeAsync(18_000)
    expect(reads).toBe(1)
    expect(data.get(key)).toBe('slow')
  })
})
