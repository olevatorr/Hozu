import { readFileSync } from 'node:fs'
import { lockDiff } from '@hozu/validator'
import { describe, expect, it } from 'vitest'

const lock = JSON.parse(
  readFileSync(new URL('../../../examples/bookmarks/hozu.lock.json', import.meta.url), 'utf8'),
)

describe('lockDiff (ADR 0056 A7)', () => {
  it('lists what --update-lock accepts, with each now:', () => {
    const before = structuredClone(lock)
    const feature = Object.keys(before.features)[0]!
    const id = Object.keys(before.features[feature])[0]!
    delete before.features[feature][id]
    const lines = lockDiff(before, lock)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(new RegExp(`^${feature}: new ${id.replace(/[./]/g, '\\$&')} · now: `))
    expect(lockDiff(lock, lock)).toEqual([])
  })
})
