import { describe, expect, it } from 'vitest'
import { distances, sizeOf } from '../src/overlay/measure.ts'

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
})

describe('Alt measuring, as in Figma (ADR 0058 A3)', () => {
  it('shows the size rounded to CSS px', () => {
    expect(sizeOf(box(0, 0, 120.4, 39.6))).toBe('120 × 40')
  })

  it('measures the gap between two separate parts', () => {
    expect(distances(box(0, 0, 100, 40), box(0, 64, 100, 40))).toEqual([
      { axis: 'v', from: 40, to: 64, at: 50 },
    ])
    expect(distances(box(0, 0, 100, 40), box(130, 0, 50, 40))).toEqual([
      { axis: 'h', from: 100, to: 130, at: 20 },
    ])
  })

  it('measures the four insets when one part holds the other, skipping zero', () => {
    expect(distances(box(16, 8, 100, 40), box(0, 0, 132, 56))).toEqual([
      { axis: 'h', from: 0, to: 16, at: 28 },
      { axis: 'h', from: 116, to: 132, at: 28 },
      { axis: 'v', from: 0, to: 8, at: 66 },
      { axis: 'v', from: 48, to: 56, at: 66 },
    ])
    expect(distances(box(0, 0, 100, 40), box(0, 0, 100, 50))).toEqual([
      { axis: 'v', from: 40, to: 50, at: 50 },
    ])
  })
})
