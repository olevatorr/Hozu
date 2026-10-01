import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import cart from '../../../examples/cart/hozu.config.ts'

const order = (css: string, a: string, b: string) => (css.indexOf(`.${a}{`) < css.indexOf(`.${b}{`) ? b : a)

const withClasses = (cls: string, toggle: Record<string, unknown> = {}) => {
  const build = buildProject(cart, { sources: false })
  const ir = structuredClone(build.ir)
  const section = ir.features.cart!.views.CartPanel!.root
  if (section.kind !== 'el') throw new Error('fixture')
  section.class = cls
  section.toggle = toggle as never
  return { ...build, ir }
}

describe('ADR 0045 evidence 2: same-property utilities', () => {
  it('are ordered by name, so the later one wins whatever order the class lists them in', async () => {
    for (const cls of ['bg-indigo-600 bg-white', 'bg-white bg-indigo-600']) {
      const { css } = await compileStyles(withClasses(cls))
      expect(order(css, 'bg-indigo-600', 'bg-white')).toBe('bg-white')
    }
    for (const cls of ['text-slate-900 text-white', 'text-white text-slate-900']) {
      const { css } = await compileStyles(withClasses(cls))
      expect(order(css, 'text-slate-900', 'text-white')).toBe('text-white')
    }
  })

  it('HZ079: a base class and a toggle that set the same property are reported', async () => {
    const build = withClasses('grid gap-6 bg-white', { 'bg-indigo-600': { literal: true } })
    const styles = await compileStyles(build)
    const found = validate(build.ir, { unknownClasses: styles.unknown, classes: styles.classes }).filter(
      (d) => d.code === 'HZ079',
    )
    expect(found).toHaveLength(1)
  })
})
