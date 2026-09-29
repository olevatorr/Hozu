import { describe, expect, it } from 'vitest'
import { transform } from '../src/transform.ts'

const head = "import { fn } from '@hozu/core'\nimport { z } from 'zod'\n"
const marked = (body: string) =>
  /__hozu\.free\([\s\S]*?, (\[[^\]]*\])\)/.exec(transform(head + body).code)?.[1]
const helpers = (body: string) =>
  /__hozu\.helpers\([\s\S]*?, \{ ([^}]*) \}\)/.exec(transform(head + body).code)?.[1]

describe('fn bodies that are not self-contained', () => {
  it('ships a self-contained module helper with the fn, and helpers it uses in turn', () => {
    const code = `const lower = (s: string) => s.toLowerCase()
function matches(name: string, text: string) { return lower(name).includes(lower(text)) }
const LIMIT = 5
export const visible = fn({
  input: z.object({ items: z.array(z.string()), text: z.string() }),
  output: z.array(z.string()),
  impl: ({ items, text }) => items.filter((s) => matches(s, text)).slice(0, LIMIT),
})`
    expect(helpers(code)).toBe('LIMIT: () => LIMIT, lower: () => lower, matches: () => matches')
    expect(marked(code)).toBeUndefined()
  })

  it('marks names that cannot be shipped: imports, mutable module state, and what helpers need from them', () => {
    expect(
      marked(
        "import { db } from './db.ts'\nexport const f = fn({ input: I, output: O, impl: (x) => db.get(x) })",
      ),
    ).toBe('["db"]')
    expect(
      marked('let count = 0\nexport const f = fn({ input: I, output: O, impl: (x) => x + count })'),
    ).toBe('["count"]')
    expect(
      marked(
        "import { rate } from './rate.ts'\nconst price = (n: number) => n * rate\nexport const f = fn({ input: I, output: O, impl: (x) => price(x) })",
      ),
    ).toBe('["rate"]')
  })

  it('lists every free name once, sorted', () => {
    expect(marked('export const f = fn({ input: I, output: O, impl: (x) => b(a(x)) + a(LIMIT) })')).toBe(
      '["LIMIT","a","b"]',
    )
  })

  it('accepts parameters, locals, nested functions, globals and property names', () => {
    const code = `export const byDistrict = fn({
  input: I,
  output: O,
  impl: ({ items, text: query }, ...rest) => {
    const sums: Record<string, number> = {}
    function add(key: string, n = 0) { sums[key] = (sums[key] ?? 0) + n }
    for (const { district, bikes } of items) add(district, bikes)
    try { JSON.parse(query) } catch (error) { console.error(error) }
    const shape = { sums, total: Math.max(0, rest.length), when: new Date().toISOString() }
    label: for (const k of Object.keys(shape)) { if (k) break label }
    return Object.entries(shape.sums).map(([district, bikes]) => ({ district, bikes, n: Number.NaN }))
  },
})`
    expect(marked(code)).toBeUndefined()
  })

  it('leaves the source untouched when nothing is free', () => {
    const code = 'export const f = fn({ input: I, output: O, impl: ({ a }) => a + 1 })'
    expect(transform(head + code).code).not.toContain('__hozu.free')
  })

  it('keeps every line in place', () => {
    const code =
      'export const f = fn({\n  input: I,\n  output: O,\n  impl: (x) => helper(x),\n})\nconst after = 1'
    const out = transform(head + code).code
    expect(out.split('\n').length).toBe((head + code).split('\n').length)
  })
})
