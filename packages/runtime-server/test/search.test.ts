import { routeTable } from '@hozu/core/ir'
import { parseSearch, pathOf } from '@hozu/runtime-server'
import { describe, expect, it } from 'vitest'

const schema = {
  type: 'object',
  properties: {
    show: { type: 'string', enum: ['all', 'unread'], default: 'all' },
    page: { type: 'integer', default: 1 },
    q: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    exact: { type: 'boolean', default: false },
  },
}

describe('search params (ADR 0014)', () => {
  it('parses, coerces and falls back to defaults', () => {
    expect(parseSearch(schema, new URLSearchParams('show=unread&page=3&q=hozu&exact=true&x=1'))).toEqual({
      show: 'unread',
      page: 3,
      q: 'hozu',
      exact: true,
    })
    expect(parseSearch(schema, new URLSearchParams('show=zzz&page=2.5&exact=yes'))).toEqual({
      show: 'all',
      page: 1,
      q: null,
      exact: false,
    })
    expect(parseSearch(null, new URLSearchParams('a=1'))).toBeNull()
  })

  it('builds one canonical URL: sorted keys, defaults and nulls left out', () => {
    const table = routeTable({
      routes: { list: { path: '/items/:cat', params: null, search: schema } },
      http: { basePath: '', trailingSlash: 'never', redirects: [], headers: [] },
    } as never)
    expect(table.list).toBe('/items/:cat#show=all&page=1&exact=false')
    expect(pathOf(table.list!, { cat: 'a b' }, { show: 'all', page: 1, q: null, exact: false })).toBe(
      '/items/a%20b',
    )
    expect(pathOf(table.list!, { cat: 'x' }, { q: 'hi there', page: 2, show: 'unread' })).toBe(
      '/items/x?page=2&q=hi%20there&show=unread',
    )
  })
})
