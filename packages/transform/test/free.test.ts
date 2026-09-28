import { describe, expect, it } from 'vitest'
import { transform } from '../src/transform.ts'

const head = "import { fn } from '@hozu/core'\nimport { z } from 'zod'\n"
const marked = (body: string) =>
  /__hozu\.free\([\s\S]*?, (\[[^\]]*\])\)/.exec(transform(head + body).code)?.[1]

describe('fn bodies that are not self-contained', () => {
  it('marks a module-level helper', () => {
    const code = `const matches = (s: { name: string }, t: string) => s.name.includes(t)
export const visible = fn({
  input: z.object({ items: z.array(z.string()), text: z.string() }),
  output: z.array(z.string()),
  impl: ({ items, text }) => items.filter((s) => matches({ name: s }, text)),
})`
    expect(marked(code)).toBe('["matches"]')
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
