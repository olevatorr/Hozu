export const PARTS = ['detail', 'toggle', 'filter', 'remove'] as const
export type Part = (typeof PARTS)[number]
export type With = Record<Part, boolean>

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function namesOf(name: string) {
  const one = name.endsWith('s') && name.length > 1 ? name.slice(0, -1) : name
  const many = name.endsWith('s') ? name : `${name}s`
  const Item = cap(one)
  return {
    id: name,
    one,
    many,
    Item,
    Key: `${Item}Key`,
    New: `New${Item}`,
    list: `list${cap(many)}`,
    get: `get${Item}`,
    add: `add${Item}`,
    toggle: `toggle${Item}`,
    remove: `remove${Item}`,
    tag: `${name}Tag`,
    machine: `${name}Machine`,
    View: `${cap(name)}Board`,
    Detail: `${Item}Detail`,
    detailRoute: `${one}Page`,
    feature: name,
    resolvers: `${name}Resolvers`,
    title: cap(name),
  }
}

export type Names = ReturnType<typeof namesOf>

const lines = (...parts: (string | false)[]) => parts.filter((p) => p !== false).join('\n')

const events = (w: With) =>
  ['Draft', 'Add', w.toggle && 'Toggle', w.remove && 'Remove', w.filter && 'SetShow'].filter(Boolean)

export function model(n: Names, w: With): string {
  const keyed = w.detail || w.toggle || w.remove
  const busy = w.toggle || w.remove
  const ignore = `ignore: [${events(w).join(', ')}],`
  const core = [
    'event',
    ...(w.filter ? ['fn'] : []),
    'invoke',
    'machine',
    'mutation',
    'on',
    'op',
    'query',
    'tag',
  ]
  const actionState = (state: string, effect: string) => `    ${state}: {
      ${ignore}
      invoke: invoke(${effect}, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [{ target: 'idle', assign: () => [op.set(ctx.error, NOT_FOUND)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },`
  return `${lines(
    `import { ${core.join(', ')} } from '@hozu/core'`,
    `import { z } from 'zod'`,
    '',
    `export const ${n.Item} = z.object({ id: z.string(), title: z.string()${w.toggle ? ', done: z.boolean()' : ''} })`,
    keyed && `export const ${n.Key} = z.object({ id: z.string() })`,
    `export const ${n.New} = z.object({`,
    `  title: z.string().min(2, 'Use at least 2 characters').max(80, 'Use at most 80 characters'),`,
    '})',
    w.filter && `export const Show = z.enum(['all', 'open', 'done'])`,
    '',
    `export const Draft = event({ payload: z.object({ text: z.string() }) })`,
    `export const Add = event({ payload: z.object({ title: z.string() }) })`,
    w.toggle && `export const Toggle = event({ payload: ${n.Key} })`,
    w.remove && `export const Remove = event({ payload: ${n.Key} })`,
    w.filter && `export const SetShow = event({ payload: z.object({ show: Show }) })`,
    '',
    `export const ${n.tag} = tag({ param: null })`,
    '',
    `export const ${n.list} = query({`,
    `  input: z.object({}),`,
    `  output: z.array(${n.Item}),`,
    `  scope: 'public',`,
    `  freshness: 'static',`,
    `  tags: () => [${n.tag}()],`,
    '})',
    w.detail &&
      `
export const ${n.get} = query({
  input: ${n.Key},
  output: ${n.Item},
  errors: { NotFound: ${n.Key} },
  scope: 'public',
  freshness: 'static',
  tags: () => [${n.tag}()],
})`,
    '',
    `export const ${n.add} = mutation({`,
    `  input: ${n.New},`,
    `  output: ${n.Item},`,
    `  errors: { Duplicate: z.object({ title: z.string() }) },`,
    `  invalidates: () => [${n.tag}()],`,
    '})',
    w.toggle &&
      `
export const ${n.toggle} = mutation({
  input: ${n.Key},
  output: ${n.Item},
  errors: { NotFound: ${n.Key} },
  invalidates: () => [${n.tag}()],
})`,
    w.remove &&
      `
export const ${n.remove} = mutation({
  input: ${n.Key},
  output: ${n.Key},
  errors: { NotFound: ${n.Key} },
  invalidates: () => [${n.tag}()],
})`,
    w.filter &&
      `
const Visible = z.object({ items: z.array(${n.Item}), show: Show })

export const visible = fn({
  input: Visible,
  output: z.array(${n.Item}),
  impl: ({ items, show }) => items.filter((item) => show === 'all' || (show === 'done') === item.done),
})

export const isEmpty = fn({
  input: Visible,
  output: z.boolean(),
  impl: ({ items, show }) => !items.some((item) => show === 'all' || (show === 'done') === item.done),
})`,
    '',
    `export const DUPLICATE = 'This ${n.one} already exists'`,
    busy && `export const NOT_FOUND = 'This ${n.one} no longer exists'`,
    '',
    `export const ${n.machine} = machine({`,
    '  context: z.object({',
    '    draft: z.string(),',
    '    error: z.string().nullable(),',
    '    fields: z.object({ title: z.string().nullable() }),',
    busy && '    target: z.string(),',
    w.filter && '    show: Show,',
    '  }),',
    `  initialContext: { draft: '', error: null, fields: { title: null }${busy ? ", target: ''" : ''}${w.filter ? ", show: 'all'" : ''} },`,
    `  initial: 'idle',`,
    '  states: ({ ctx }) => ({',
    '    idle: {',
    '      on: [',
    `        on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.text)] }),`,
    '        on(Add, {',
    `          target: 'adding',`,
    '          assign: (e) => [',
    '            op.set(ctx.draft, e.title),',
    '            op.set(ctx.error, null),',
    '            op.set(ctx.fields, { title: null }),',
    '          ],',
    '        }),',
    w.toggle &&
      `        on(Toggle, { target: 'toggling', assign: (e) => [op.set(ctx.target, e.id), op.set(ctx.error, null)] }),`,
    w.remove &&
      `        on(Remove, { target: 'removing', assign: (e) => [op.set(ctx.target, e.id), op.set(ctx.error, null)] }),`,
    w.filter && `        on(SetShow, { target: 'idle', assign: (e) => [op.set(ctx.show, e.show)] }),`,
    '      ],',
    '    },',
    '    adding: {',
    `      ${ignore}`,
    `      invoke: invoke(${n.add}, {`,
    '        input: { title: ctx.draft },',
    `        done: [{ target: 'idle', assign: () => [op.set(ctx.draft, '')] }],`,
    '        failed: {',
    `          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, DUPLICATE)] }],`,
    `          Invalid: [{ target: 'idle', assign: (e) => [op.set(ctx.fields, e.fields)] }],`,
    `          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],`,
    '        },',
    '      }),',
    '    },',
    w.toggle && actionState('toggling', n.toggle),
    w.remove && actionState('removing', n.remove),
    '  }),',
    '})',
  )}\n`
}

export function views(n: Names, w: With, listRoute: string | null): string {
  const modelNames = [
    'Add',
    n.add,
    'DUPLICATE',
    'Draft',
    n.list,
    n.machine,
    n.tag,
    ...(w.detail ? [n.get] : []),
    ...(w.toggle ? ['Toggle', n.toggle] : []),
    ...(w.remove ? ['Remove', n.remove] : []),
    ...(w.toggle || w.remove ? ['NOT_FOUND'] : []),
    ...(w.filter ? ['SetShow', 'visible', 'isEmpty'] : []),
  ].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  const itemForm = (event: string, label: string) =>
    `ui.form({ class: 'inline', on: { submit: ui.send(${event}, { id: ui.dom.form('id') }) } }, [
                      ui.input({ type: 'hidden', name: 'id', value: item.id }),
                      ui.button({ type: 'submit', class: 'text-sm underline' }, [${label}]),
                    ])`
  const itemChildren = [
    w.detail
      ? `ui.a({ href: ui.link(${n.detailRoute}, { id: item.id }), class: 'flex-1 underline' }, [item.title])`
      : `ui.span({ class: 'flex-1' }, [item.title])`,
    ...(w.toggle
      ? [
          `ui.span({ class: 'text-xs text-slate-500' }, [ui.if(op.eq(item.done, true), ['done'], ['open'])])`,
          itemForm('Toggle', `ui.if(op.eq(item.done, true), ['Mark open'], ['Mark done'])`),
        ]
      : []),
    ...(w.remove ? [itemForm('Remove', `'Delete'`)] : []),
  ]
  const list = `ui.ul({ class: 'divide-y rounded border' }, [
                ui.each(${w.filter ? 'visible({ items, show: ctx.show })' : 'items'}, 'id', (item) =>
                  ui.li({ class: 'flex items-center gap-3 px-4 py-3' }, [
                    ${itemChildren.join(',\n                    ')},
                  ]),
                ),
              ])`
  const ready = w.filter
    ? `ui.if(
              isEmpty({ items, show: ctx.show }),
              [ui.p({ class: 'text-slate-500' }, ['No items'])],
              [
              ${list},
              ],
            )`
    : list
  const actionContracts = (event: string, state: string, effect: string, name: string, result: string) => `
export const ${name}s = contract(${n.machine}, {
  given: { state: 'idle' },
  when: [
    { send: ${event}, payload: { id: 'x1' } },
    { done: ${effect}, result: ${result} },
  ],
  expect: { state: 'idle', changes: { target: 'x1' }, effects: [{ effect: ${effect}, input: { id: 'x1' } }] },
})

export const ${name}Missing = contract(${n.machine}, {
  given: { state: '${state}' },
  when: [{ failed: ${effect}, error: 'NotFound', data: { id: 'x1' } }],
  expect: { state: 'idle', changes: { error: NOT_FOUND } },
})

export const ${name}Fails = contract(${n.machine}, {
  given: { state: '${state}' },
  when: [{ failed: ${effect}, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})`
  const itemResult = `{ id: 'x1', title: 'Ship'${w.toggle ? ', done: true' : ''} }`
  const contracts = [
    'typesDraft',
    'adds',
    'rejectsDuplicate',
    'rejectsInvalid',
    'addFails',
    ...(w.toggle ? ['toggles', 'toggleMissing', 'toggleFails'] : []),
    ...(w.remove ? ['removes', 'removeMissing', 'removeFails'] : []),
    ...(w.filter ? ['filters'] : []),
  ]
  return `${lines(
    `import { contract, feature, op, ui } from '@hozu/core'`,
    w.detail && `import { ${[listRoute ?? 'home', n.detailRoute].sort().join(', ')} } from '../../routes.ts'`,
    `import {\n  ${modelNames.join(',\n  ')},\n} from './model.ts'`,
    '',
    w.filter &&
      `const shows = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
] as const
`,
    `export const ${n.View} = ui.view({`,
    `  machine: ${n.machine},`,
    '  render: ({ ctx, when }) =>',
    `    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-12' }, [`,
    `      ui.h1({ class: 'text-3xl font-bold' }, ['${n.title}']),`,
    `      ui.form({ class: 'flex gap-2', on: { submit: ui.send(Add, { title: ui.dom.form('title') }) } }, [`,
    `        ui.label({ for: '${n.id}-title', class: 'sr-only' }, ['Title']),`,
    '        ui.input({',
    `          id: '${n.id}-title',`,
    `          name: 'title',`,
    '          required: true,',
    '          minlength: 2,',
    '          maxlength: 80,',
    '          value: ctx.draft,',
    `          'aria-invalid': op.neq(ctx.fields.title, null),`,
    `          'aria-describedby': '${n.id}-title-error',`,
    `          class: 'flex-1 rounded border px-3 py-2',`,
    '          on: { input: ui.send(Draft, { text: ui.dom.value }) },',
    '        }),',
    `        ui.button({ type: 'submit', class: 'rounded bg-indigo-600 px-4 py-2 text-white' }, ['Add']),`,
    '      ]),',
    `      ui.p({ id: '${n.id}-title-error', class: 'text-sm text-rose-600' }, [ctx.fields.title]),`,
    `      ui.if(op.neq(ctx.error, null), [ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error])], []),`,
    `      when(['adding'], [ui.p({ class: 'opacity-50', 'aria-busy': 'true' }, ['Adding ', ctx.draft, '…'])]),`,
    w.filter &&
      `      ui.nav(
        { class: 'flex gap-2', 'aria-label': 'Show' },
        shows.map((s) =>
          ui.button(
            {
              type: 'button',
              'aria-pressed': op.eq(ctx.show, s.value),
              class: 'rounded-full border px-3 py-1 aria-pressed:bg-indigo-600 aria-pressed:text-white',
              on: { click: ui.send(SetShow, { show: s.value }) },
            },
            [s.label],
          ),
        ),
      ),`,
    '      ui.query(',
    `        ${n.list},`,
    '        {},',
    '        {',
    '          ready: (items) =>',
    `            ${ready},`,
    `          pending: ui.p({}, ['Loading…']),`,
    `          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },`,
    '        },',
    '      ),',
    '    ]),',
    '})',
    w.detail &&
      `
export const ${n.Detail} = ui.view({
  route: ${n.detailRoute},
  render: ({ params }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-4 px-4 py-12' }, [
      ui.query(
        ${n.get},
        { id: params.id },
        {
          ready: (item) =>
            ui.article({}, [
              ui.h1({ class: 'text-3xl font-bold' }, [item.title]),${
                w.toggle
                  ? `
              ui.p({}, ['Status: ', ui.if(op.eq(item.done, true), ['done'], ['open'])]),`
                  : ''
              }
            ]),
          pending: null,
          failed: {
            NotFound: () => ui.p({ role: 'alert' }, ['Not found']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']),
          },
        },
      ),
      ui.a({ href: ui.link(${listRoute ?? 'home'}, null), class: 'underline' }, ['Back']),
    ]),
})`,
    `
export const typesDraft = contract(${n.machine}, {
  given: { state: 'idle' },
  when: [{ send: Draft, payload: { text: 'Ship' } }],
  expect: { state: 'idle', changes: { draft: 'Ship' } },
})

export const adds = contract(${n.machine}, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { title: 'Ship' } },
    { done: ${n.add}, result: { id: 'x1', title: 'Ship'${w.toggle ? ', done: false' : ''} } },
  ],
  expect: { state: 'idle', effects: [{ effect: ${n.add}, input: { title: 'Ship' } }] },
})

export const rejectsDuplicate = contract(${n.machine}, {
  given: { state: 'adding' },
  when: [{ failed: ${n.add}, error: 'Duplicate', data: { title: 'Ship' } }],
  expect: { state: 'idle', changes: { error: DUPLICATE } },
})

export const rejectsInvalid = contract(${n.machine}, {
  given: { state: 'adding' },
  when: [
    {
      failed: ${n.add},
      error: 'Invalid',
      data: { message: 'title: Use at least 2 characters', fields: { title: 'Use at least 2 characters' } },
    },
  ],
  expect: { state: 'idle', changes: { fields: { title: 'Use at least 2 characters' } } },
})

export const addFails = contract(${n.machine}, {
  given: { state: 'adding' },
  when: [{ failed: ${n.add}, error: 'Unexpected', data: { message: 'offline' } }],
  expect: { state: 'idle', changes: { error: 'offline' } },
})`,
    w.toggle && actionContracts('Toggle', 'toggling', n.toggle, 'toggle', itemResult),
    w.remove && actionContracts('Remove', 'removing', n.remove, 'remove', `{ id: 'x1' }`),
    w.filter &&
      `
export const filters = contract(${n.machine}, {
  given: { state: 'idle' },
  when: [{ send: SetShow, payload: { show: 'done' } }],
  expect: { state: 'idle', changes: { show: 'done' } },
})`,
    `
export const ${n.feature} = feature({
  id: '${n.id}',
  intent: { summary: '${n.title}: add one with a title; titles are unique, case-insensitive.' },
  declarations: {
    ${[
      ...events(w),
      n.tag,
      n.list,
      ...(w.detail ? [n.get] : []),
      n.add,
      ...(w.toggle ? [n.toggle] : []),
      ...(w.remove ? [n.remove] : []),
      ...(w.filter ? ['visible', 'isEmpty'] : []),
      n.machine,
      n.View,
      ...(w.detail ? [n.Detail] : []),
      ...contracts,
    ].join(',\n    ')},
  },
})`,
  )}\n`
}

export function server(n: Names, w: With): string {
  const find = w.detail || w.toggle
  const imports = [
    n.add,
    n.list,
    ...(w.detail ? [n.get] : []),
    ...(w.toggle ? [n.toggle] : []),
    ...(w.remove ? [n.remove] : []),
  ]
  return `${lines(
    `import type { Implement } from '@hozu/data'`,
    `import { ${imports.sort().join(', ')} } from './model.ts'`,
    '',
    `export function ${n.resolvers}<Session, Env>(implement: Implement<Session, Env>) {`,
    `  const items: { id: string; title: string${w.toggle ? '; done: boolean' : ''} }[] = []`,
    '  let seq = 0',
    find && '  const find = (id: string) => items.find((item) => item.id === id)',
    '  return [',
    `    implement(${n.list}, () => items.map((item) => ({ ...item }))),`,
    w.detail &&
      `    implement(${n.get}, ({ id }, { fail }) => {
      const item = find(id)
      return item ? { ...item } : fail('NotFound', { id })
    }),`,
    `    implement(${n.add}, ({ title }, { fail }) => {`,
    '      const clean = title.trim()',
    '      if (items.some((item) => item.title.toLowerCase() === clean.toLowerCase()))',
    `        return fail('Duplicate', { title: clean })`,
    `      const item = { id: \`${n.one.charAt(0)}\${++seq}\`, title: clean${w.toggle ? ', done: false' : ''} }`,
    '      items.unshift(item)',
    '      return { ...item }',
    '    }),',
    w.toggle &&
      `    implement(${n.toggle}, ({ id }, { fail }) => {
      const item = find(id)
      if (!item) return fail('NotFound', { id })
      item.done = !item.done
      return { ...item }
    }),`,
    w.remove &&
      `    implement(${n.remove}, ({ id }, { fail }) => {
      const at = items.findIndex((item) => item.id === id)
      if (at < 0) return fail('NotFound', { id })
      items.splice(at, 1)
      return { id }
    }),`,
    '  ]',
    '}',
  )}\n`
}
