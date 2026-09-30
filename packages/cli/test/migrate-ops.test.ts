import { describe, expect, it } from 'vitest'
import { migrateOps } from '../src/commands/migrate-ops.ts'

const run = (source: string) => migrateOps(source, 'views.ts')

describe('migrate: op.* and ui.if', () => {
  it('rewrites comparisons, and / or / not, keeping precedence', () => {
    const { code } = run(`import { op, ui } from '@hozu/core'
const g = (e) => op.and(op.eq(e.a, 1), op.or(op.not(e.b), op.gt(e.c, 2)))
`)
    expect(code).toBe(`import { ui } from '@hozu/core'
const g = (e) => e.a === 1 && (!e.b || e.c > 2)
`)
  })

  it('turns a motion-less ui.if into ?: or &&, keeping arrays for several nodes', () => {
    const { code } = run(`import { ui } from '@hozu/core'
const a = (c) => ui.if(c.x, [ui.p({}, ['a'])], [])
const b = (c) => ui.if(c.x, [ui.p({}, ['a']), ui.p({}, ['b'])], [ui.p({}, ['c'])])
const m = (c) => ui.if(c.x, [ui.p({}, ['a'])], [], 'fade')
`)
    expect(code).toContain("const a = (c) => c.x && ui.p({}, ['a'])")
    expect(code).toContain("const b = (c) => c.x ? [ui.p({}, ['a']), ui.p({}, ['b'])] : ui.p({}, ['c'])")
    expect(code).toContain("ui.if(c.x, [ui.p({}, ['a'])], [], 'fade')")
  })

  it('rewrites assign lists to statements', () => {
    const { code } = run(`import { op } from '@hozu/core'
const t = { assign: (e) => [op.set(ctx.a, e.a), op.append(ctx.l, e.x), op.inc(ctx.n, 1), op.removeWhere(ctx.l, 'id', e.id)] }
`)
    expect(code).toContain(
      '{\n  ctx.a = e.a\n  ctx.l.push(e.x)\n  ctx.n += 1\n  ctx.l = ctx.l.filter((item) => item.id !== e.id)\n} }',
    )
    expect(code).not.toContain('import')
  })

  it('indents the statements like their neighbours, in the indent unit of the module', () => {
    const nested = run(`import { machine, on, op } from '@hozu/core'
export const m = machine({
  states: ({ ctx }) => ({
    idle: {
      on: [on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.title), op.set(ctx.error, null)] })],
    },
  }),
})
`)
    expect(nested.code).toContain(`      on: [on(Draft, { target: 'idle', assign: (e) => {
        ctx.draft = e.title
        ctx.error = null
      } })],`)
    const four = run(`import { on, op } from "@hozu/core";
const t = {
    idle: on(Draft, {
        assign: (e) => [op.set(ctx.draft, e.title)],
    }),
};
`)
    expect(four.code).toContain(`        assign: (e) => {
            ctx.draft = e.title
        },`)
  })

  it('keeps a multi-line import multi-line, in the quotes of the module', () => {
    const { code } = run(`import {
  machine,
  on,
  op,
} from "@hozu/core";
const g = (e) => op.eq(e.a, 1);
`)
    expect(code).toBe(`import {
  machine,
  on,
} from "@hozu/core";
const g = (e) => e.a === 1;
`)
  })

  it('lists value-position op.and / op.or: no TS spelling has the same IR', () => {
    const { notes } = run(`import { op, ui } from '@hozu/core'
const v = (c) => ui.p({ hidden: op.and(c.a, c.b) }, [])
`)
    expect(notes.map((n) => [n.line, n.behaviour ?? false, n.message.slice(0, 26)])).toEqual([
      [1, false, 'op.* and motion-less ui.if'],
      [2, true, 'value-position op.and has '],
    ])
  })

  it('is idempotent and leaves files without Hozu imports alone', () => {
    const once = run(`import { op } from '@hozu/core'\nexport const g = (e) => op.eq(e.a, 1)\n`).code
    expect(run(once).code).toBe(once)
    const plain = 'export const x = (a) => a.if(1, 2, 3)\n'
    expect(run(plain).code).toBe(plain)
  })
})
