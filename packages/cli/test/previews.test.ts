import { fileURLToPath } from 'node:url'
import { componentCatalog } from '@hozu/core/ir'
import { previews } from '@hozu/core/preview'
import { describe, expect, it } from 'vitest'
import { listNotes } from '../../../examples/notes/features/notes/model.ts'
import { home } from '../../../examples/notes/routes.ts'
import { Button } from '../../../examples/notes/ui/button.ts'
import { load } from '../src/load.ts'
import { checkPreviews, devPreviews, loadPreviews, renderUse } from '../src/previews.ts'

const notes = fileURLToPath(new URL('../../../examples/notes/', import.meta.url))

describe('Assets and previews (ADR 0058 G, H)', () => {
  it('lists every component with its variants, an example for its props and the pages that use it', async () => {
    const loaded = await load(undefined, notes)
    const all = componentCatalog(loaded.build(true), { root: notes })
    const button = all.find((c) => c.id === 'ui.Button')!
    expect(button.variants.tone).toEqual(['primary', 'subtle', 'plain'])
    expect(button.location?.file).toBe('ui/button.ts')
    expect(button.uses.flatMap((u) => u.pages.map((p) => p.path))).toContain('/')
    expect(all.find((c) => c.id === 'ui.Field')!.example).toMatchObject({ label: 'Preview text' })
  })

  it('resolves previews.ts to component ids and query answers, and passes hozu check', async () => {
    const loaded = await load(undefined, notes)
    const build = loaded.build(true)
    const { set, problems } = await loadPreviews(loaded)
    expect(problems).toEqual([])
    const dev = devPreviews(loaded, build, set)
    expect(dev.components['ui.Button']).toEqual([
      {
        name: 'Long label',
        use: {
          variant: { tone: 'primary' },
          props: {},
          slots: {},
          children: 'Save every note you wrote today',
        },
      },
    ])
    expect(dev.pages.home!.map((p) => p.name)).toEqual(['No notes', 'Twelve notes', 'Notes failed'])
    expect(dev.pages.home![0]!.data).toEqual({
      'account.me': { ok: true, value: { name: 'ada' } },
      'notes.listNotes': { ok: true, value: [] },
    })
    expect(checkPreviews(loaded, build, set)).toEqual([])
  })

  it('HZ092: data off the output schema, an undeclared error and a component use that does not build', async () => {
    const loaded = await load(undefined, notes)
    const broken = previews((p) => [
      p.page(home, 'Bad data', [p.data(listNotes, [{ id: 1 }] as never)]),
      p.page(home, 'Bad error', [p.fail(listNotes, 'Gone' as never)]),
      p.component(Button, 'Bad variant', { variant: { tone: 'loud' } as never }),
    ])
    const found = checkPreviews(loaded, loaded.build(true), broken)
    expect(found.map((d) => d.code)).toEqual(['HZ092', 'HZ092', 'HZ092'])
    expect(found[0]!.message).toContain(
      'Preview "Bad data": data for notes.listNotes does not match its output',
    )
    expect(found[0]!.location.source?.file).toContain('previews.test.ts')
    expect(found[1]!.message).toBe('Preview "Bad error": notes.listNotes declares no error "Gone"')
    expect(found[2]!.message).toContain('Preview "Bad variant" of ui.Button')
  })

  it('renders one use alone, children included', async () => {
    const loaded = await load(undefined, notes)
    const out = await renderUse(loaded, 'ui.Button', { variant: {}, props: {}, slots: {}, children: 'Go' })
    expect(out.ok).toBe(true)
    expect(out.html).toMatch(/^<button[^>]*class="[^"]+"[^>]*>Go<\/button>$/)
  })

  it('a previews module that is missing, throws or exports something else is HZ014, not a crash', async () => {
    const { mkdtempSync, writeFileSync, cpSync, symlinkSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const messages: string[] = []
    for (const body of [null, "throw new Error('boom from previews')\n", 'export const x = 1\n']) {
      const dir = mkdtempSync(join(fileURLToPath(new URL('../../../.tmp/', import.meta.url)), 'previews-'))
      try {
        cpSync(notes, dir, {
          recursive: true,
          filter: (f) => !f.includes('node_modules') && !f.includes('.hozu'),
        })
        symlinkSync(join(notes, 'node_modules'), join(dir, 'node_modules'))
        if (body === null) rmSync(join(dir, 'previews.ts'))
        else writeFileSync(join(dir, 'previews.ts'), body)
        const { set, problems } = await loadPreviews(await load(undefined, dir))
        expect(set).toBeNull()
        expect(problems.map((p) => p.code)).toEqual(['HZ014'])
        messages.push(problems[0]!.message)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
    expect(messages).toEqual([
      'project({ previews }) names a file that does not exist',
      'previews.ts failed to load: boom from previews',
      'previews.ts does not default-export previews(...)',
    ])
  })
})
