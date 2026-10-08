import { describe, expect, it } from 'vitest'
import { pathOf } from '../src/data.ts'

describe('pathOf leaves defaults out (ADR 0070 A1)', () => {
  it('also after an optional segment, whose ? is not the defaults separator', () => {
    const pattern = '/shop/:category??sort=featured&page=1'
    expect(pathOf(pattern, { category: 'apparel' }, { sort: 'featured', page: 1 })).toBe('/shop/apparel')
    expect(pathOf(pattern, { category: null }, { sort: 'new', page: 1 })).toBe('/shop?sort=new')
    expect(pathOf('/shop/:category?', { category: 'mugs' }, { page: 2 })).toBe('/shop/mugs?page=2')
    expect(pathOf('/journal?topic=all', null, { topic: 'all' })).toBe('/journal')
    expect(pathOf('/a/:b?/c', { b: 'x' }, null)).toBe('/a/x/c')
  })
})
