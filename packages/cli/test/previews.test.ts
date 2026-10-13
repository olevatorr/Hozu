import { fileURLToPath } from 'node:url'
import { componentCatalog } from '@hozu/core/ir'
import { previews } from '@hozu/core/preview'
import { describe, expect, it } from 'vitest'
import { listNotes } from '../../../examples/notes/features/notes/model.ts'
import { home } from '../../../examples/notes/routes.ts'
import { Button } from '../../../examples/notes/ui/button.ts'
import { load } from '../src/load.ts'
import { checkPreviews, devPreviews, loadPreviews, renderExample, renderUse } from '../src/previews.ts'

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

  it('project({ previews }) takes a list: every file loads, a broken one is HZ014 and the others still load; p.example renders as written', async () => {
    const { mkdtempSync, writeFileSync, readFileSync, cpSync, symlinkSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(fileURLToPath(new URL('../../../.tmp/', import.meta.url)), 'previews-'))
    try {
      cpSync(notes, dir, {
        recursive: true,
        filter: (f) => !f.includes('node_modules') && !f.includes('.hozu'),
      })
      symlinkSync(join(notes, 'node_modules'), join(dir, 'node_modules'))
      writeFileSync(
        join(dir, 'ui/examples.ts'),
        [
          "import { ui } from '@hozu/core'",
          "import { previews } from '@hozu/core/preview'",
          "import { Button } from './button.ts'",
          '',
          'export default previews((p) => [',
          "  p.example(Button, 'Two buttons', () =>",
          "    ui.div({}, [ui.use(Button, { variant: { tone: 'primary' } }, ['Save']), ui.use(Button, {}, ['Cancel'])]),",
          '  ),',
          "  p.example(Button, 'Bad tone', () => ui.use(Button, { variant: { tone: 'loud' } as never }, ['x'])),",
          '])',
          '',
        ].join('\n'),
      )
      const config = join(dir, 'hozu.config.ts')
      const listed = readFileSync(config, 'utf8').replace(
        "previews: new URL('./previews.ts', import.meta.url),",
        "previews: [new URL('./previews.ts', import.meta.url), new URL('./ui/examples.ts', import.meta.url)],",
      )
      writeFileSync(config, listed)
      const loaded = await load(undefined, dir)
      const build = loaded.build(true)
      const { set, problems } = await loadPreviews(loaded)
      expect(problems).toEqual([])
      const dev = devPreviews(loaded, build, set)
      expect(dev.components['ui.Button']?.map((p) => p.name)).toEqual(['Long label'])
      expect(dev.examples?.['ui.Button']).toEqual([
        { name: 'Two buttons', file: 'ui/examples.ts', line: expect.any(Number) },
        { name: 'Bad tone', file: 'ui/examples.ts', line: expect.any(Number) },
      ])
      const two = await renderExample(loaded, set, 'ui.Button', 'Two buttons')
      expect(two.ok).toBe(true)
      expect(two.html).toMatch(/^<div><button[^>]*>Save<\/button><button[^>]*>Cancel<\/button><\/div>$/)
      const bad = checkPreviews(loaded, build, set)
      expect(bad.map((d) => d.code)).toEqual(['HZ092'])
      expect(bad[0]!.message).toContain('Example "Bad tone" of ui.Button')
      expect(bad[0]!.location.source?.file).toContain('examples.ts')

      writeFileSync(join(dir, 'broken.config.ts'), listed.replace("'./ui/examples.ts'", "'./ui/missing.ts'"))
      const broken = await loadPreviews(await load('broken.config.ts', dir))
      expect(broken.problems.map((p) => p.message)).toEqual([
        'project({ previews }) names a file that does not exist',
      ])
      expect(broken.set?.list.length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
