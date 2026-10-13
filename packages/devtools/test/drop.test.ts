// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { dropPosition, gestureGuard, holds } from '../src/overlay/drop.ts'

describe('where a dragged component lands (drag onto the page)', () => {
  const rect = { top: 100, height: 40 }

  it('the top quarter is before, the bottom quarter after, the middle inside', () => {
    expect(dropPosition(rect, 100, true)).toBe('before')
    expect(dropPosition(rect, 109, true)).toBe('before')
    expect(dropPosition(rect, 111, true)).toBe('inside')
    expect(dropPosition(rect, 129, true)).toBe('inside')
    expect(dropPosition(rect, 131, true)).toBe('after')
    expect(dropPosition(rect, 140, true)).toBe('after')
  })

  it('an element that holds nothing splits at the middle', () => {
    expect(dropPosition(rect, 119, false)).toBe('before')
    expect(dropPosition(rect, 121, false)).toBe('after')
    expect(dropPosition({ top: 0, height: 0 }, 0, true)).toBe('inside')
  })

  it('inputs, images and buttons take nothing inside', () => {
    for (const tag of ['INPUT', 'img', 'button', 'textarea', 'select', 'svg']) expect(holds(tag)).toBe(false)
    for (const tag of ['DIV', 'h1', 'ul', 'section', 'form']) expect(holds(tag)).toBe(true)
  })
})

describe('the guard that keeps a drop from pressing the page', () => {
  it('a drag that starts while the last one is still settling holds the page until its own end', () => {
    vi.useFakeTimers()
    try {
      const guard = gestureGuard(() => [window])
      guard.hold(document.body)
      guard.settle()
      vi.advanceTimersByTime(200)
      guard.hold(document.body)
      vi.advanceTimersByTime(600)
      expect(guard.holding()).toBe(true)
      const click = new MouseEvent('click', { bubbles: true, cancelable: true })
      document.body.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(true)
      expect(guard.holding()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
