import { readFileSync } from 'node:fs'
import { designTokens } from '@hozu/css'
import { describe, expect, it } from 'vitest'
import { configBlock, configStatus, syncConfig, tvModule, twMergeConfigOf } from '../src/config.ts'
import { createTV } from '../src/index.ts'

const source = `@import "tailwindcss";
@theme { --text-hero: 3rem; --text-hero--line-height: 1.1; --color-brand: #4f46e5; --font-display: serif; }
@utility card { border-radius: 1rem; }
@utility chip-* { color: --value(--color-*); }`

describe('@hozu/variants/config (ADR 0045 D)', () => {
  it('maps the theme namespaces to tailwind-merge scales and @utility names to their own groups', async () => {
    const tokens = await designTokens(source, process.cwd())
    expect(tokens).toEqual({
      theme: ['--color-brand', '--font-display', '--text-hero', '--text-hero--line-height'],
      utilities: ['card'],
      functional: ['chip'],
    })
    const config = twMergeConfigOf(tokens)
    expect(config.extend.theme).toEqual({ color: ['brand'], font: ['display'], text: ['hero'] })
    expect(Object.keys(config.extend.classGroups)).toEqual(['card', 'chip'])
  })

  it('keeps text-hero next to text-white with the generated config; the default config drops one', async () => {
    const twMergeConfig = twMergeConfigOf(await designTokens(source, process.cwd()))
    expect(createTV({ twMergeConfig })({ base: 'text-hero text-white' })()).toBe('text-hero text-white')
    expect(createTV({})({ base: 'text-hero text-white' })()).toBe('text-white')
  })

  it('writes the block between markers, reports it stale, and --sync rewrites only the block', async () => {
    const empty = twMergeConfigOf({ theme: [], utilities: [], functional: [] })
    const hero = twMergeConfigOf({ theme: ['--text-hero'], utilities: [], functional: [] })
    const file = tvModule('ui', empty)
    expect(file).toBe(
      "import { createTV } from '@hozu/variants'\n\n// hozu:variants-config ui\nconst twMergeConfig = {\n  extend: {\n    theme: {},\n    classGroups: {},\n  },\n}\n// /hozu:variants-config\n\nexport const tv = createTV({ twMergeConfig })\n",
    )
    expect(configStatus(file, 'ui', empty)).toBe('current')
    expect(configStatus(file.replace('theme: {}', 'theme: { }'), 'ui', empty)).toBe('current')
    expect(configStatus(file, 'ui', hero)).toBe('stale')
    expect(configStatus(file, 'kit', hero)).toBe('none')
    const synced = syncConfig(`${file}// mine\n`, 'ui', hero)!
    expect(synced).toContain(configBlock('ui', hero))
    expect(synced.endsWith('// mine\n')).toBe(true)
    expect(configStatus(synced, 'ui', hero)).toBe('current')
  })

  it('stays out of the record-time graph: the runtime entry does not import it, and it imports nothing', () => {
    const entry = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
    const config = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8')
    expect(entry).not.toMatch(/config/)
    expect(config).not.toMatch(/^import /m)
  })
})
