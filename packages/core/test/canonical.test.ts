import { canonicalStringify, hashJson, join, parsePointer, resolveSource } from '@tenon/core/ir'
import { describe, expect, it } from 'vitest'

describe('canonical JSON', () => {
  it('sorts keys at every depth and normalizes -0', () => {
    expect(canonicalStringify({ b: 1, a: { d: [3, { z: 1, y: -0 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":0,"z":1}]},"b":1}',
    )
  })

  it('rejects values that are not JSON', () => {
    expect(() => canonicalStringify({ a: undefined })).toThrow(/Undefined/)
    expect(() => canonicalStringify(Number.NaN)).toThrow(/Non-finite/)
    expect(() => canonicalStringify(() => 1)).toThrow(/not valid JSON/)
  })

  it('hashes independently of key order', () => {
    expect(hashJson({ a: 1, b: [1, 2] })).toBe(hashJson({ b: [1, 2], a: 1 }))
    expect(hashJson({ a: [1, 2] })).not.toBe(hashJson({ a: [2, 1] }))
  })
})

describe('JSON pointers', () => {
  it('escapes and parses tokens', () => {
    const p = join('', 'features', 'cart', 'on', 'a/b~c')
    expect(p).toBe('/features/cart/on/a~1b~0c')
    expect(parsePointer(p)).toEqual(['features', 'cart', 'on', 'a/b~c'])
  })

  it('resolves the nearest ancestor source', () => {
    const sources = { '/features/cart': 1, '/features/cart/machine': 2 }
    expect(resolveSource(sources, '/features/cart/machine/states/idle')).toBe(2)
    expect(resolveSource(sources, '/features/cart/views/X')).toBe(1)
    expect(resolveSource(sources, '/routes/home')).toBeNull()
  })
})
