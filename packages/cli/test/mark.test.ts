import { describe, expect, it } from 'vitest'
import { banner, colorDepth } from '../src/mark.ts'

describe('the mark beside hozu dev (ADR 0090 B2)', () => {
  const tty = { isTTY: true }

  it('paints only on a terminal that wants colour', () => {
    expect(colorDepth(tty, {})).toBe('256')
    expect(colorDepth(tty, { COLORTERM: 'truecolor' })).toBe('truecolor')
    expect(colorDepth({ isTTY: false }, {})).toBe(null)
    expect(colorDepth(tty, { NO_COLOR: '1' })).toBe(null)
    expect(colorDepth(tty, { TERM: 'dumb' })).toBe(null)
    expect(colorDepth(tty, { CI: 'true' })).toBe(null)
    expect(colorDepth({ isTTY: false }, { FORCE_COLOR: '1' })).toBe('256')
    expect(colorDepth(tty, { FORCE_COLOR: '0' })).toBe(null)
    expect(colorDepth(tty, { FORCE_COLOR: 'false' })).toBe(null)
    expect(colorDepth(tty, { FORCE_COLOR: '3' })).toBe('truecolor')
    expect(colorDepth(tty, { CI: 'false' })).toBe('256')
  })

  it('prints the same lines without the mark when there is no colour', () => {
    expect(banner(['Hozu 1.0.0 · dev', '➜ Local: http://localhost:3000'], null)).toEqual([
      'Hozu 1.0.0 · dev',
      '➜ Local: http://localhost:3000',
    ])
  })

  it('indents lines past the mark under the others', () => {
    const lines = banner(
      Array.from({ length: 11 }, (_, i) => `line ${i}`),
      '256',
    )
    expect(lines).toHaveLength(11)
    expect(lines.slice(9)).toEqual([`${' '.repeat(19)}line 9`, `${' '.repeat(19)}line 10`])
  })

  it('sets the lines beside the nine rows of the mark', () => {
    const lines = banner(['a', 'b', 'c'], 'truecolor')
    expect(lines).toHaveLength(9)
    const plain = lines.map((l) => l.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), ''))
    expect(plain.map((l) => l.slice(16).trim())).toEqual(['', '', '', 'a', 'b', 'c', '', '', ''])
    expect(plain.every((l) => /^[ ▀▄█]{16}/.test(l.padEnd(16)))).toBe(true)
    expect(plain.join('').replace(/[^▀▄█]/g, '').length).toBeGreaterThan(80)
    expect(lines[4]).toContain('\x1b[38;2;251;58;14m')
  })
})
