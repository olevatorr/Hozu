import type { GuardExpr } from '@hozu/core/ir'
import { describe, expect, it } from 'vitest'
import { picking } from '../src/contracts/solve.ts'

const is = (v: string): GuardExpr => ({
  op: 'eq',
  left: { ref: 'context', path: ['x'] },
  right: { literal: v },
})
const schemas = { context: { type: 'object', properties: { x: { enum: ['a', 'b', 'c'] } } } }

describe('picking (ADR 0083 A15)', () => {
  it('makes earlier guards false and this one true', () => {
    expect(picking([{ guard: is('a') }, { guard: is('b') }], 1, schemas)).toEqual([
      { ref: 'context', path: ['x'], value: 'b' },
      { ref: 'context', path: ['x'], value: 'b' },
    ])
  })

  it('gives up rather than print values that pick another entry', () => {
    expect(picking([{ guard: is('a') }, { guard: is('b') }, { guard: null }], 2, schemas)).toBeNull()
  })
})
