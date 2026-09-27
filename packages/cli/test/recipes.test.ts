import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from 'create-hozu'
import { afterAll, describe, expect, it } from 'vitest'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const dir = join(root, '.tmp', `recipes-${Date.now()}`)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function run(args: string[]) {
  let stdout = ''
  const code = await main(args, dir, (s) => {
    stdout += s
  })
  return { code, stdout }
}

const edit = (file: string, pairs: [string, string][]) => {
  const path = join(dir, file)
  let source = readFileSync(path, 'utf8')
  for (const [from, to] of pairs) {
    expect(source, `${file}: ${from}`).toContain(from)
    source = source.replace(from, to)
  }
  writeFileSync(path, source)
}

const m = 'features/items/model.ts'
const v = 'features/items/views.ts'
const s = 'features/items/server.ts'

describe('changing.md recipes (ADR 0028)', () => {
  it('an enum field chosen in the add form, and an action button, applied as written, check clean', async () => {
    mkdirSync(join(root, '.tmp'), { recursive: true })
    await createApp(dir, {
      name: 'recipes',
      agent: 'claude',
      version: '0.3.0',
      runner: 'npx',
      skillSource: `${root}.claude/skills/hozu`,
    })
    await run(['add', 'feature', 'items', '--page', '/', '--with', 'detail,toggle'])
    edit(m, [
      [
        'export const Item = z.object({ id: z.string(), title: z.string(), done: z.boolean() })',
        "export const Priority = z.enum(['low', 'normal', 'high'])\nexport const Item = z.object({ id: z.string(), title: z.string(), done: z.boolean(), priority: Priority })",
      ],
      [
        "max(80, 'Use at most 80 characters'),\n})",
        "max(80, 'Use at most 80 characters'),\n  priority: Priority,\n})",
      ],
      [
        'export const Add = event({ payload: z.object({ title: z.string() }) })',
        'export const Add = event({ payload: z.object({ title: z.string(), priority: Priority }) })',
      ],
      [
        '    fields: z.object({ title: z.string().nullable() }),',
        '    fields: z.object({ title: z.string().nullable(), priority: z.string().nullable() }),\n    priority: Priority,',
      ],
      [
        "initialContext: { draft: '', error: null, fields: { title: null }, target: '' }",
        "initialContext: { draft: '', error: null, fields: { title: null, priority: null }, target: '', priority: 'normal' }",
      ],
      [
        '            op.set(ctx.fields, { title: null }),',
        '            op.set(ctx.fields, { title: null, priority: null }),\n            op.set(ctx.priority, e.priority),',
      ],
      [
        '        input: { title: ctx.draft },',
        '        input: { title: ctx.draft, priority: ctx.priority },',
      ],
      [
        'export const Toggle = event({ payload: ItemKey })',
        'export const Toggle = event({ payload: ItemKey })\nexport const ClearDone = event({ payload: z.object({}) })',
      ],
      [
        'export const DUPLICATE',
        'export const clearDone = mutation({ input: z.object({}), output: z.object({ removed: z.number() }), invalidates: () => [itemsTag()] })\n\nexport const DUPLICATE',
      ],
      [
        '        on(Toggle, {',
        "        on(ClearDone, { target: 'clearing', assign: () => [op.set(ctx.error, null)] }),\n        on(Toggle, {",
      ],
    ])
    const model = readFileSync(join(dir, m), 'utf8').replace(
      '  }),\n})\n',
      `    clearing: { invoke: invoke(clearDone, { input: {}, done: 'idle', failed: { Unexpected: { target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] } } }) },\n  }),\n})\n`,
    )
    writeFileSync(join(dir, m), model)
    edit(v, [
      [
        "ui.send(Add, { title: ui.dom.form('title') })",
        "ui.send(Add, { title: ui.dom.form('title'), priority: ui.dom.form('priority') })",
      ],
      [
        "        ui.button({ type: 'submit', class: 'rounded bg-indigo-600 px-4 py-2 text-white' }, ['Add']),",
        "        ui.select({ name: 'priority', 'aria-label': 'Priority', class: 'rounded border px-2' }, ['low', 'normal', 'high'].map((p) => ui.option({ value: p, selected: p === 'normal' }, [p]))),\n        ui.button({ type: 'submit', class: 'rounded bg-indigo-600 px-4 py-2 text-white' }, ['Add']),",
      ],
      [
        "ui.span({ class: 'text-xs text-slate-500' }, [ui.if(op.eq(item.done, true), ['done'], ['open'])]),",
        "ui.span({ class: 'text-xs text-slate-500' }, [ui.if(op.eq(item.done, true), ['done'], ['open'])]),\n                    ui.span({ class: 'text-xs' }, [item.priority]),",
      ],
      ['  addItem,', '  addItem,\n  ClearDone,\n  clearDone,'],
      [
        "      when(['adding']",
        "      ui.form({ on: { submit: ui.send(ClearDone, {}) } }, [ui.button({ type: 'submit', class: 'text-sm underline' }, ['Clear done'])]),\n      when(['adding']",
      ],
      ['  declarations: {\n', '  declarations: {\n    ClearDone,\n    clearDone,\n'],
      [
        "ui.p({}, ['Status: '",
        "ui.p({}, ['Priority: ', item.priority]),\n              ui.p({}, ['Status: '",
      ],
    ])
    edit(s, [
      [
        'const items: { id: string; title: string; done: boolean }[] = []',
        "const items: { id: string; title: string; done: boolean; priority: 'low' | 'normal' | 'high' }[] = []",
      ],
      ['implement(addItem, ({ title }, { fail })', 'implement(addItem, ({ title, priority }, { fail })'],
      ['title: clean, done: false }', 'title: clean, done: false, priority }'],
      [
        "import { addItem, getItem, listItems, toggleItem } from './model.ts'",
        "import { addItem, clearDone, getItem, listItems, toggleItem } from './model.ts'",
      ],
      [
        '  return [\n',
        '  return [\n    implement(clearDone, () => { const before = items.length; items.splice(0, items.length, ...items.filter((i) => !i.done)); return { removed: before - items.length } }),\n',
      ],
    ])
    const check = await run(['check', '--json'])
    const out = JSON.parse(check.stdout)
    expect(out.types.errors).toEqual([])
    expect(out.validate.summary).toEqual({ errors: 0, warnings: 0 })
    const flow = await run([
      'post',
      '/',
      '--field',
      'title=Alpha',
      '--field',
      'priority=high',
      '--next',
      '/items/i1',
      '--next',
      'POST / id=i1@Mark done',
      '--next',
      'POST / @Clear done',
      '--next',
      '/items/i1',
      '--json',
    ])
    const steps = JSON.parse(flow.stdout).steps as { path: string; status: number; text: string | null }[]
    expect(steps.find((x) => x.path === '/items/i1')?.text).toContain('Priority: high')
    expect(steps.at(-1)).toMatchObject({ path: '/items/i1', status: 404 })
  }, 60_000)
})
