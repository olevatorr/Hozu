import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildProject } from '@hozu/core/ir'
import { compileStyles, selectorClasses } from '@hozu/css'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import blog from '../../../examples/blog/hozu.config.ts'
import cart from '../../../examples/cart/hozu.config.ts'

describe('styles', () => {
  it('builds exactly the classes the IR uses, from the project entry and feature stylesheets', async () => {
    const build = buildProject(blog, { sources: false })
    const styles = await compileStyles(build)
    expect(styles.unknown).toEqual(new Map())
    expect(styles.href).toMatch(/^\/_hozu\/styles\.[0-9a-f]{12}\.css$/)
    expect(styles.css).toContain('.reading-list{')
    expect(styles.css).toContain('.prose')
    expect(styles.css).toContain('--color-brand-600')
    expect(styles.css).not.toContain('.text-red-500')
    expect(styles.files.some((f) => f.endsWith('saved.css'))).toBe(true)
  })

  it('HZ026 — unknown classes with a variant-preserving suggestion and a patch', async () => {
    const build = buildProject(cart, { sources: true })
    const ir = structuredClone(build.ir)
    const section = ir.features.cart!.views.CartPanel!.root
    if (section.kind !== 'el') throw new Error('fixture')
    section.class = 'grid gap-6 md:bg-rde-500'
    const styles = await compileStyles({ ...build, ir })
    expect(styles.unknown).toEqual(new Map([['md:bg-rde-500', 'md:bg-red-500']]))
    const found = validate(ir, { sources: build.sources, unknownClasses: styles.unknown }).filter(
      (d) => d.code === 'HZ026',
    )
    expect(found.map((d) => [d.message, d.location.pointer])).toEqual([
      [
        'Class "md:bg-rde-500" produces no CSS. Did you mean "md:bg-red-500"?',
        '/features/cart/views/CartPanel/root/class',
      ],
    ])
    expect(found[0]!.location.source?.file).toMatch(/examples\/cart\/features\/cart\/views\.ts$/)
    expect(found[0]!.fix?.patch).toEqual([
      { op: 'replace', path: '/features/cart/views/CartPanel/root/class', value: 'grid gap-6 md:bg-red-500' },
    ])
  })

  it('HZ026 — a motion name without any CSS', async () => {
    const build = buildProject(cart, { sources: true })
    const ir = structuredClone(build.ir)
    const json = JSON.stringify(ir).replace('"motion":"list"', '"motion":"slide"')
    const mutated = JSON.parse(json) as typeof ir
    const styles = await compileStyles({ ...build, ir: mutated })
    const found = validate(mutated, { sources: build.sources, unknownClasses: styles.unknown }).filter(
      (d) => d.code === 'HZ026',
    )
    expect(found.map((d) => d.message)).toEqual(['Motion "slide" has no CSS'])
    expect(found[0]!.fix?.snippet).toContain('.slide-enter-active')
    const clean = await compileStyles(build)
    expect(validate(build.ir, { unknownClasses: clean.unknown }).filter((d) => d.code === 'HZ026')).toEqual(
      [],
    )
  })

  it('reads class selectors back from generated CSS, including escaped Tailwind names', () => {
    expect([
      ...selectorClasses(
        '.md\\:grid-cols-2{}.w-1\\/2{}.group-hover\\:x:is(:where(.group):hover *){}.\\[mask-type\\:a\\]{}',
      ),
    ]).toEqual(['md:grid-cols-2', 'w-1/2', 'group-hover:x', 'group', '[mask-type:a]'])
  })
})

describe('page transitions', () => {
  it('turns on cross-document view transitions before the project stylesheet', async () => {
    const { css } = await compileStyles(buildProject(cart, { sources: false }))
    expect(css.indexOf('@view-transition{navigation:auto}')).toBeGreaterThanOrEqual(0)
    expect(css.indexOf('@view-transition{navigation:auto}')).toBeLessThan(css.indexOf('@layer theme{'))
    expect(css).toMatch(
      /@media \(prefers-reduced-motion:reduce\)\{::view-transition-group\(\*\)\{animation:none!important\}/,
    )
  })

  it('a project turns them off with its own @view-transition rule, which comes later', async () => {
    const build = buildProject(cart, { sources: false })
    const entry = join(await mkdtemp(join(tmpdir(), 'hozu-css-')), 'app.css')
    await writeFile(entry, '@import "tailwindcss";\n@view-transition { navigation: none; }\n')
    const { css } = await compileStyles({
      ...build,
      bindings: { ...build.bindings, styles: { entry, kits: {}, features: {} } },
    })
    expect(css.indexOf('@view-transition{navigation:none}')).toBeGreaterThan(
      css.indexOf('@view-transition{navigation:auto}'),
    )
  })
})
