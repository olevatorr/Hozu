import { describe, expect, it } from 'vitest'
import { testApp } from '@hozu/testing'

describe('testApp (ADR 0043 C)', () => {
  it('posts a native form from a record or from [name, value] pairs, repeated names kept in order', async () => {
    const app = testApp((await import('../../../examples/bookmarks/app.ts')).default)
    const action = /<form[^>]* action="([^"]+)"/.exec((await app.get('/')).html)![1]!.replace(/&amp;/g, '&')
    const record = await app.post(action, { title: 'x', kind: 'article' })
    const pairs = await app.post(action, [
      ['title', 'x'],
      ['kind', 'article'],
    ])
    expect([pairs.status, pairs.text]).toEqual([record.status, record.text])
    expect(record.text).toContain('Use at least 2 characters')
    const repeated = await app.post(action, [
      ['title', 'x'],
      ['title', 'A long enough title'],
      ['kind', 'article'],
    ])
    expect(repeated.text).toContain('Use at least 2 characters')
  })
})
