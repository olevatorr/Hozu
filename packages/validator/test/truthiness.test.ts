import { scanTruthiness, truthinessDiagnostics } from '@hozu/validator'
import { describe, expect, it } from 'vitest'

const source = `
export const visible = fn({ input: X, output: Y, impl: ({ items, show }) => items.filter((i) => show === 'all' || !i.done) })
export const Board = ui.view({
  machine: m,
  render: ({ ctx, when, params }) =>
    ui.main({}, [
      ui.p({}, [ctx.error ? 'Error' : 'Fine']),
      ui.p({ title: ctx.error ?? 'none' }, [ctx.show && 'x']),
      ui.if(op.neq(ctx.error, null), [ui.p({}, [ctx.error])], []),
      ['a', 'b'].map((k) => ui.option({ value: k, selected: k === 'a' || !k }, [k])),
      ui.each(list, 'id', (item) => ui.li({}, [item.done ? 'done' : 'open', \`#\${item.id}\`, !item.done])),
      ui.p({}, [params.id || 'none']),
      when(['adding'], [ui.p({}, ['Adding'])]),
    ]),
})
const guarded = on(Add, { target: 'x', guard: (e) => (e.title ? op.eq(e.title, '') : op.eq(1, 1)) })
function helper(x) { if (x) return 1 }
`

describe('HZ044 reference-truthiness (mistake catalog, source level)', () => {
  it('finds references used as JavaScript conditions, and nothing in fn impls, list callbacks or plain functions', () => {
    expect(scanTruthiness(source).map((f) => `${f.line}:${f.expression} ${f.use}`)).toEqual([
      '7:ctx.error a ?: condition',
      '8:ctx.error the left side of ??',
      '8:ctx.show the left side of &&',
      '11:item.done a ?: condition',
      '11:item.done the operand of !',
      '12:params.id the left side of ||',
      '16:e.title a ?: condition',
    ])
  })

  it('reports each as a warning with its source location and the op.* fix', () => {
    const [d] = truthinessDiagnostics({ '/app/views.ts': source })
    expect(d).toMatchObject({
      code: 'HZ044',
      severity: 'warning',
      location: { feature: null, pointer: '', source: { file: '/app/views.ts', line: 7, column: 17 } },
    })
    expect(d!.fix?.snippet).toBe('ui.if(op.neq(ctx.error, null), [/* then */], [/* else */])')
  })
})
