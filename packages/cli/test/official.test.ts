import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { officialState } from '../src/commands/official.ts'

const app = () => {
  const root = mkdtempSync(join(tmpdir(), 'hozu-official-'))
  writeFileSync(join(root, 'hozu.config.ts'), '')
  return root
}

const withPackage = (root: string) => {
  const dir = join(root, 'node_modules/@hozu/ui-kit')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@hozu/ui-kit', version: '0.2.0' }))
  writeFileSync(
    join(dir, 'catalog.json'),
    JSON.stringify({
      kit: 'kit.ts',
      styles: 'theme.css',
      themes: [],
      files: {
        'button.ts': { components: ['Button', 'LinkButton'], uses: [] },
        'icons/lucide.ts': { components: [], uses: [] },
      },
    }),
  )
}

describe('the official kit DevTools shows (ADR 0089 P4)', () => {
  it('finds the kit whose lock names @hozu/ui-kit and lists the package components', () => {
    const root = app()
    withPackage(root)
    mkdirSync(join(root, 'ui'))
    mkdirSync(join(root, 'brand'))
    writeFileSync(
      join(root, 'ui/kit.lock.json'),
      JSON.stringify({ source: '@hozu/ui-kit', version: '0.1.0', partial: true, files: {} }),
    )
    expect(officialState(root, ['brand', 'ui'])).toEqual({
      kit: 'ui',
      version: '0.1.0',
      partial: true,
      available: [
        { name: 'Button', file: 'button.ts' },
        { name: 'LinkButton', file: 'button.ts' },
      ],
    })
  })

  it('without the kit or the package there is nothing to show', () => {
    const root = app()
    expect(officialState(root, ['ui'])).toEqual({ kit: null, version: null, partial: false, available: [] })
    withPackage(root)
    expect(officialState(root, ['ui'])).toMatchObject({ kit: null, version: '0.2.0' })
  })
})
