import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { currentUtility, oklchToHex, parseTheme, utilityFor, utilityValue } from '../src/theme.ts'

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

  it('maps the Figma properties to theme utilities (ADR 0058 B1)', () => {
    expect(theme.shadow.md).toContain('0 4px 6px -1px')
    expect(utilityFor('width', '320px', theme)).toEqual({ utility: 'w-80', exact: true, nearest: null })
    expect(utilityFor('width', '100%', theme)).toEqual({ utility: 'w-full', exact: true, nearest: null })
    expect(utilityFor('height', 'auto', theme)).toEqual({ utility: 'h-auto', exact: true, nearest: null })
    expect(utilityFor('gap', '16px', theme)).toEqual({ utility: 'gap-4', exact: true, nearest: null })
    expect(utilityFor('opacity', '0.5', theme)).toEqual({ utility: 'opacity-50', exact: true, nearest: null })
    expect(utilityFor('opacity', '0.42', theme)).toEqual({
      utility: 'opacity-[0.42]',
      exact: false,
      nearest: 'opacity-40',
    })
    expect(utilityFor('borderWidth', '1px', theme)).toEqual({ utility: 'border', exact: true, nearest: null })
    expect(utilityFor('borderWidth', '2px', theme)).toEqual({
      utility: 'border-2',
      exact: true,
      nearest: null,
    })
    expect(utilityFor('borderWidth', '3px', theme)).toEqual({
      utility: 'border-[3px]',
      exact: false,
      nearest: null,
    })
    expect(utilityFor('borderColor', '#fb3a0e', theme)).toEqual({
      utility: 'border-red',
      exact: true,
      nearest: null,
    })
    expect(utilityFor('boxShadow', theme.shadow.lg!, theme)).toEqual({
      utility: 'shadow-lg',
      exact: true,
      nearest: null,
    })
    expect(utilityFor('boxShadow', 'none', theme)).toEqual({
      utility: 'shadow-none',
      exact: true,
      nearest: null,
    })
    const classes = 'w-full h-10 gap-2 opacity-80 border border-red shadow-md text-red'
    expect(currentUtility('width', classes, theme)).toBe('w-full')
    expect(currentUtility('height', classes, theme)).toBe('h-10')
    expect(currentUtility('gap', classes, theme)).toBe('gap-2')
    expect(currentUtility('opacity', classes, theme)).toBe('opacity-80')
    expect(currentUtility('borderWidth', classes, theme)).toBe('border')
    expect(currentUtility('borderColor', classes, theme)).toBe('border-red')
    expect(currentUtility('boxShadow', classes, theme)).toBe('shadow-md')
  })

  it('reads the value a class sets, ignoring hover: variants (0.17.1)', () => {
    const classes = 'bg-red hover:bg-ink text-2xl px-4 rounded-lg opacity-80 border-2 shadow-md w-full'
    const own = (prop: Parameters<typeof utilityValue>[0]) =>
      utilityValue(prop, currentUtility(prop, classes, theme)!, theme)
    expect(own('backgroundColor')).toBe('#fb3a0e')
    expect(own('fontSize')).toBe('24px')
    expect(own('paddingInline')).toBe('16px')
    expect(own('borderRadius')).toBe('8px')
    expect(own('opacity')).toBe('0.8')
    expect(own('borderWidth')).toBe('2px')
    expect(own('boxShadow')).toBe(theme.shadow.md)
    expect(own('width')).toBe('100%')
    expect(utilityValue('fontSize', 'text-[18px]', theme)).toBe('18px')
  })
})
