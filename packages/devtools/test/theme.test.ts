import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { currentUtility, oklchToHex, parseTheme, utilityFor } from '../src/theme.ts'

const css = createRequire(fileURLToPath(new URL('../../css/package.json', import.meta.url)))
const base = readFileSync(css.resolve('tailwindcss/theme.css'), 'utf8')
const project =
  '@import "tailwindcss";\n@theme {\n  --color-red: #fb3a0e;\n  --color-ink: #111010;\n  --text-hero: 5rem;\n}\n'
const theme = parseTheme(base, project)

describe('theme utilities for style edits (ADR 0047 P4)', () => {
  it('reads Tailwind defaults and the project @theme', () => {
    expect(theme.text['2xl']).toBe(24)
    expect(theme.text.hero).toBe(80)
    expect(theme.weight.bold).toBe(700)
    expect(theme.radius.lg).toBe(8)
    expect(theme.spacing).toBe(4)
    expect(theme.colors.red).toBe('#fb3a0e')
    expect(theme.colors['red-500']).toBe(oklchToHex('oklch(63.7% 0.237 25.331)'))
    expect(theme.own).toEqual(['red', 'ink'])
  })

  it('converts oklch to the same hex the browser shows', () => {
    expect(oklchToHex('oklch(100% 0 0)')).toBe('#ffffff')
    expect(oklchToHex('oklch(0% 0 0)')).toBe('#000000')
    expect(oklchToHex('oklch(63.7% 0.237 25.331)')).toBe('#fb2c36')
  })

  it('names the theme step when one matches, and the nearest step plus an exact value when none does', () => {
    expect(utilityFor('fontSize', '24px', theme)).toEqual({ utility: 'text-2xl', exact: true, nearest: null })
    expect(utilityFor('fontSize', '23px', theme)).toEqual({
      utility: 'text-[23px]',
      exact: false,
      nearest: 'text-2xl',
    })
    expect(utilityFor('fontWeight', '700', theme)).toEqual({
      utility: 'font-bold',
      exact: true,
      nearest: null,
    })
    expect(utilityFor('paddingInline', '24px', theme)).toEqual({
      utility: 'px-6',
      exact: true,
      nearest: null,
    })
    expect(utilityFor('paddingBlock', '10px', theme)).toEqual({
      utility: 'py-2.5',
      exact: true,
      nearest: null,
    })
    expect(utilityFor('paddingBlock', '9px', theme)).toEqual({
      utility: 'py-2.25',
      exact: true,
      nearest: null,
    })
    expect(utilityFor('paddingBlock', '9.5px', theme)).toEqual({
      utility: 'py-[9.5px]',
      exact: false,
      nearest: 'py-2.5',
    })
    expect(utilityFor('borderRadius', '8px', theme)).toEqual({
      utility: 'rounded-lg',
      exact: true,
      nearest: null,
    })
    expect(utilityFor('borderRadius', '9999px', theme).utility).toBe('rounded-full')
  })

  it('prefers the project colour, then a Tailwind colour, then an exact value', () => {
    expect(utilityFor('backgroundColor', '#fb3a0e', theme)).toEqual({
      utility: 'bg-red',
      exact: true,
      nearest: null,
    })
    expect(utilityFor('color', '#fb2c36', theme)).toEqual({
      utility: 'text-red-500',
      exact: true,
      nearest: null,
    })
    expect(utilityFor('color', '#123456', theme)).toMatchObject({ utility: 'text-[#123456]', exact: false })
    expect(utilityFor('color', '#123456', theme).nearest).toMatch(/^text-/)
  })

  it('finds the class that sets the property now, so the agent replaces it', () => {
    const classes = 'rounded bg-indigo-600 px-4 py-2 text-white text-sm font-medium w-full rounded-lg!'
    expect(currentUtility('fontSize', classes, theme)).toBe('text-sm')
    expect(currentUtility('color', classes, theme)).toBe('text-white')
    expect(currentUtility('backgroundColor', classes, theme)).toBe('bg-indigo-600')
    expect(currentUtility('paddingInline', classes, theme)).toBe('px-4')
    expect(currentUtility('borderRadius', classes, theme)).toBe('rounded-lg!')
    expect(currentUtility('fontWeight', classes, theme)).toBe('font-medium')
    expect(currentUtility('fontWeight', 'p-3', theme)).toBeNull()
    expect(currentUtility('paddingBlock', 'p-3', theme)).toBe('p-3')
  })
})
