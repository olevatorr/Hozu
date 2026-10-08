export const PARTS = ['auth', 'detail', 'toggle', 'filter', 'remove'] as const
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

export function model(n: Names, w: With): string {
  const keyed = w.detail || w.toggle || w.remove
  const busy = w.toggle || w.remove
  const core = ['event', ...(w.filter ? ['fn'] : []), 'invoke', 'machine', 'mutation', 'on', 'query', 'tag']
  const access = `  access: '${w.auth ? 'signedIn' : 'anyone'}',`
  const actionState = (state: string, effect: string) => `    ${state}: {
      invoke: invoke(${effect}, {
        input: { id: ctx.target },
        done: 'idle',
        failed: {
          NotFound: { target: 'idle', assign: () => { ctx.error = 'notFound' } },
          Unexpected: { target: 'idle', assign: () => { ctx.error = 'unexpected' } },
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
    `export const Add = event({ payload: z.object({ title: z.string() }) })`,
    w.toggle && `export const Toggle = event({ payload: ${n.Key} })`,
    w.remove && `export const Remove = event({ payload: ${n.Key} })`,
    '',
    `export const ${n.tag} = tag({ param: null })`,
    '',
    `export const ${n.list} = query({`,
    `  input: z.object({}),`,
    `  output: z.array(${n.Item}),`,
    `  scope: '${w.auth ? 'user' : 'public'}',`,
    `  freshness: '${w.auth ? 'request' : 'static'}',`,
    `  tags: () => [${n.tag}()],`,
    `  runs: 'server',`,
    w.auth && access,
    '})',
    w.detail &&
      `
export const ${n.get} = query({
  input: ${n.Key},
  output: ${n.Item},
  errors: { NotFound: ${n.Key} },
  scope: '${w.auth ? 'user' : 'public'}',
  freshness: '${w.auth ? 'request' : 'static'}',
  tags: () => [${n.tag}()],
  runs: 'server',${w.auth ? `\n${access}` : ''}
})`,
    '',
    `export const ${n.add} = mutation({`,
    `  input: ${n.New},`,
    `  output: ${n.Item},`,
    `  errors: { Duplicate: z.object({ title: z.string() }) },`,
    `  invalidates: () => [${n.tag}()],`,
    `  runs: 'server',`,
    access,
    '})',
    w.toggle &&
      `
export const ${n.toggle} = mutation({
  input: ${n.Key},
  output: ${n.Item},
  errors: { NotFound: ${n.Key} },
  invalidates: () => [${n.tag}()],
  runs: 'server',
${access}
})`,
    w.remove &&
      `
export const ${n.remove} = mutation({
  input: ${n.Key},
  output: ${n.Key},
  errors: { NotFound: ${n.Key} },
  invalidates: () => [${n.tag}()],
  runs: 'server',
${access}
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
    `export const Problem = z.enum(['duplicate', ${busy ? "'notFound', " : ''}'unexpected'])`,
    '',
    `export const ${n.machine} = machine({`,
    '  context: z.object({',
    '    draft: z.string(),',
    '    error: Problem.nullable(),',
    '    fields: z.object({ title: z.string().nullable() }),',
    busy && '    target: z.string(),',
    w.filter && '    show: Show,',
    '  }),',
    `  initialContext: { draft: '', error: null, fields: { title: null }${busy ? ", target: ''" : ''}${w.filter ? ", show: 'all'" : ''} },`,
    `  initial: 'idle',`,
    '  states: ({ ctx }) => ({',
    '    idle: {',
    '      on: [',
    '        on(Add, {',
    `          target: 'adding',`,
    '          assign: (e) => {',
    '            ctx.draft = e.title',
    '            ctx.error = null',
    '            ctx.fields = { title: null }',
    '          },',
    '        }),',
    w.toggle &&
      `        on(Toggle, { target: 'toggling', assign: (e) => { ctx.target = e.id; ctx.error = null } }),`,
    w.remove &&
      `        on(Remove, { target: 'removing', assign: (e) => { ctx.target = e.id; ctx.error = null } }),`,
    '      ],',
    '    },',
    '    adding: {',
    `      invoke: invoke(${n.add}, {`,
    '        input: { title: ctx.draft },',
    `        done: { target: 'idle', assign: () => { ctx.draft = '' } },`,
    '        failed: {',
    `          Duplicate: { target: 'idle', assign: () => { ctx.error = 'duplicate' } },`,
    `          Invalid: { target: 'idle', assign: (e) => { ctx.fields = e.fields } },`,
    `          Unexpected: { target: 'idle', assign: () => { ctx.error = 'unexpected' } },`,
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
    n.list,
    n.machine,
    n.tag,
    ...(w.detail ? [n.get] : []),
    ...(w.toggle ? ['Toggle', n.toggle] : []),
    ...(w.remove ? ['Remove', n.remove] : []),
    ...(w.filter ? ['visible', 'isEmpty'] : []),
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
          `ui.span({ class: 'text-xs text-slate-500' }, [item.done ? 'done' : 'open'])`,
          itemForm('Toggle', `item.done ? 'Mark open' : 'Mark done'`),
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
    ? `isEmpty({ items, show: ctx.show })
              ? ui.p({ class: 'text-slate-500' }, ['No items'])
              : ${list}`
    : list
  const body = `${lines(
    w.filter &&
      `const shows = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
] as const
`,
    `export const ${n.View} = ui.view({`,
    `  machine: ${n.machine},`,
    '  render: ({ ctx, is }) =>',
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
    `          'aria-invalid': ctx.fields.title !== null,`,
    `          'aria-describedby': '${n.id}-title-error',`,
    `          class: 'flex-1 rounded border px-3 py-2',`,
    '          on: { input: ui.set(ctx.draft, ui.dom.value) },',
    '        }),',
    `        ui.button({ type: 'submit', disabled: is(['adding']), class: 'rounded bg-indigo-600 px-4 py-2 text-white' }, ['Add']),`,
    '      ]),',
    `      ui.p({ id: '${n.id}-title-error', class: 'text-sm text-rose-600' }, [ctx.fields.title]),`,
    `      ctx.error !== null &&`,
    `        ui.p({ role: 'alert', class: 'text-rose-600' }, [`,
    `          ctx.error === 'duplicate'`,
    `            ? 'This ${n.one} already exists'`,
    (w.toggle || w.remove) && `            : ctx.error === 'notFound'`,
    (w.toggle || w.remove) && `              ? 'This ${n.one} no longer exists'`,
    `${w.toggle || w.remove ? '              ' : '            '}: 'Something went wrong. Try again.',`,
    `        ]),`,
    `      is(['adding']) && ui.p({ class: 'opacity-50', 'aria-busy': 'true' }, ['Adding ', ctx.draft, '…']),`,
    w.filter &&
      `      ui.nav(
        { class: 'flex gap-2', 'aria-label': 'Show' },
        shows.map((s) =>
          ui.button(
            {
              type: 'button',
              'aria-pressed': ctx.show === s.value,
              class: 'rounded-full border px-3 py-1 aria-pressed:bg-indigo-600 aria-pressed:text-white',
              on: { click: ui.set(ctx.show, s.value) },
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
    `          failed: { ${w.auth ? "Forbidden: () => ui.p({ role: 'alert' }, ['Signed out']), " : ''}Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },`,
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
              ui.p({}, ['Status: ', item.done ? 'done' : 'open']),`
                  : ''
              }
            ]),
          failed: {
            NotFound: () => ui.p({ role: 'alert' }, ['Not found']),
            Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']),
          },
        },
      ),
      ui.a({ href: ui.link(${listRoute ?? 'home'}, null), class: 'underline' }, ['Back']),
    ]),
})`,
  )}\n`
  const used = modelNames.filter((name) => new RegExp(`\\b${name}\\b`).test(body))
  return `${lines(
    `import { ui } from '@hozu/core'`,
    w.detail && `import { ${[listRoute ?? 'home', n.detailRoute].sort().join(', ')} } from '../../routes.ts'`,
    `import {\n  ${used.join(',\n  ')},\n} from './model.ts'`,
    '',
  )}\n${body}`
}

export function featureFile(n: Names): string {
  return `import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const ${n.feature} = feature({
  id: '${n.id}',
  intent: { summary: '${n.title}: add one with a title; titles are unique, case-insensitive.' },
  declarations: [model, views],
})
`
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
  const Row = `{ id: string; title: string${w.toggle ? '; done: boolean' : ''} }`
  const ctx = (rest: string) =>
    w.auth ? `{ ${[...rest.split(', ').filter(Boolean), 'session'].join(', ')} }` : `{ ${rest} }`
  const scoped = (body: string, own = true) =>
    w.auth
      ? `{\n      const items = ${own ? 'ownListOf' : 'listOf'}(session)\n${body}\n    }`
      : `{\n      const items = demoItems\n${body}\n    }`
  return `${lines(
    `import type { Implement } from '@hozu/data'`,
    `import { ${imports.sort().join(', ')} } from './model.ts'`,
    '',
    w.auth
      ? `export function ${n.resolvers}<Env>(implement: Implement<{ user: string }, Env>) {`
      : `export function ${n.resolvers}<Session, Env>(implement: Implement<Session, Env>) {`,
    w.auth
      ? `  const demoStore = new Map<string, ${Row}[]>()
  const listOf = (session: { user: string }): ${Row}[] => demoStore.get(session.user) ?? []
  const ownListOf = (session: { user: string }) => {
    const list = demoStore.get(session.user) ?? []
    demoStore.set(session.user, list)
    return list
  }`
      : `  const demoItems: ${Row}[] = []`,
    '  let demoSeq = 0',
    find && `  const find = (items: ${Row}[], id: string) => items.find((item) => item.id === id)`,
    '  return [',
    w.auth
      ? `    implement(${n.list}, (_, { session }) => listOf(session).map((item) => ({ ...item }))),`
      : `    implement(${n.list}, () => demoItems.map((item) => ({ ...item }))),`,
    w.detail &&
      `    implement(${n.get}, ({ id }, ${ctx('fail')}) => ${scoped(
        `      const item = find(items, id)
      return item ? { ...item } : fail('NotFound', { id })`,
        false,
      )}),`,
    `    implement(${n.add}, ({ title }, ${ctx('fail')}) => ${scoped(`      const clean = title.trim()
      if (items.some((item) => item.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      const item = { id: \`${n.one.charAt(0)}\${++demoSeq}\`, title: clean${w.toggle ? ', done: false' : ''} }
      items.unshift(item)
      return { ...item }`)}),`,
    w.toggle &&
      `    implement(${n.toggle}, ({ id }, ${ctx('fail')}) => ${scoped(`      const item = find(items, id)
      if (!item) return fail('NotFound', { id })
      item.done = !item.done
      return { ...item }`)}),`,
    w.remove &&
      `    implement(${n.remove}, ({ id }, ${ctx('fail')}) => ${scoped(`      const at = items.findIndex((item) => item.id === id)
      if (at < 0) return fail('NotFound', { id })
      items.splice(at, 1)
      return { id }`)}),`,
    '  ]',
    '}',
  )}\n`
}

export function accountModel(homeRoute: string): string {
  return `import { event, invoke, machine, mutation, on, query, ui } from '@hozu/core'
import { z } from 'zod'
import { ${[homeRoute, 'login'].sort().join(', ')} } from '../../routes.ts'

export const Session = z.object({ user: z.string() })
export const Name = z.object({ name: z.string().regex(/^\\s*[A-Za-z]{2,20}\\s*$/, 'Use 2–20 letters') })

export const SignIn = event({ payload: z.object({ name: z.string() }) })
export const SignOut = event({ payload: z.object({}) })

export const me = query({
  input: z.object({}),
  output: z.object({ name: z.string() }),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: 'signedIn',
})

export const signIn = mutation({ input: Name, output: z.object({}), runs: 'server', access: 'anyone' })
export const signOut = mutation({ input: z.object({}), output: z.object({}), runs: 'server', access: 'anyone' })

export const accountMachine = machine({
  context: z.object({
    draft: z.string(),
    error: z.string().nullable(),
    fields: z.object({ name: z.string().nullable() }),
  }),
  initialContext: { draft: '', error: null, fields: { name: null } },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SignIn, {
          target: 'signingIn',
          assign: (e) => { ctx.draft = e.name; ctx.error = null; ctx.fields = { name: null } },
        }),
        on(SignOut, { target: 'signingOut' }),
      ],
    },
    signingIn: {
      invoke: invoke(signIn, {
        input: { name: ctx.draft },
        done: { target: 'idle', navigate: () => ui.link(${homeRoute}, null) },
        failed: {
          Invalid: { target: 'idle', assign: (e) => { ctx.fields = e.fields } },
          Unexpected: { target: 'idle', assign: (e) => { ctx.error = e.message } },
        },
      }),
    },
    signingOut: {
      invoke: invoke(signOut, {
        input: {},
        done: { target: 'idle', navigate: () => ui.link(login, null) },
        failed: { Unexpected: { target: 'idle', assign: (e) => { ctx.error = e.message } } },
      }),
    },
  }),
})
`
}

export function accountViews(homePath: string): string {
  return `import { contract, ui } from '@hozu/core'
import { login } from '../../routes.ts'
import { accountMachine, me, SignIn, SignOut, signIn, signOut } from './model.ts'

export const Login = ui.view({
  machine: accountMachine,
  route: login,
  render: ({ ctx }) =>
    ui.main({ class: 'mx-auto max-w-sm space-y-6 px-4 py-16' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['Sign in']),
      ui.form({ class: 'space-y-3', on: { submit: ui.send(SignIn, { name: ui.dom.form('name') }) } }, [
        ui.label({ for: 'name', class: 'block text-sm font-medium' }, ['Name']),
        ui.input({
          id: 'name',
          name: 'name',
          required: true,
          minlength: 2,
          maxlength: 20,
          autocomplete: 'username',
          'aria-invalid': ctx.fields.name !== null,
          'aria-describedby': 'name-error',
          class: 'w-full rounded border px-3 py-2',
        }),
        ui.p({ id: 'name-error', class: 'text-sm text-rose-600' }, [ctx.fields.name]),
        ui.button({ type: 'submit', class: 'w-full rounded bg-indigo-600 px-4 py-2 text-white' }, ['Sign in']),
      ]),
      ctx.error !== null && ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error]),
    ]),
})

export const AccountBar = ui.view({
  machine: accountMachine,
  render: () =>
    ui.header({ class: 'mx-auto flex max-w-xl items-center justify-between px-4 pt-8 text-sm text-slate-600' }, [
      ui.query(
        me,
        {},
        {
          ready: (user) => ui.p({}, ['Signed in as ', user.name]),
          failed: { Forbidden: () => ui.p({}, ['Signed out']), Unexpected: () => ui.p({}, ['']) },
        },
      ),
      ui.form({ on: { submit: ui.send(SignOut, {}) } }, [
        ui.button({ type: 'submit', class: 'underline' }, ['Sign out']),
      ]),
    ]),
})

export const signsIn = contract(accountMachine, {
  given: { state: 'idle' },
  when: [
    { send: SignIn, payload: { name: 'ada' } },
    { done: signIn, result: {} },
  ],
  expect: {
    state: 'idle',
    changes: { draft: 'ada' },
    effects: [{ effect: signIn, input: { name: 'ada' } }, { navigate: '${homePath}' }],
  },
})

export const signsOut = contract(accountMachine, {
  given: { state: 'idle' },
  when: [
    { send: SignOut, payload: {} },
    { done: signOut, result: {} },
  ],
  expect: { state: 'idle', effects: [{ effect: signOut, input: {} }, { navigate: '/login' }] },
})
`
}

export const accountFeature = () => `import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const account = feature({
  id: 'account',
  intent: { summary: 'Sign in with a name, sign out; the session identifies the user' },
  exports: [model.me],
  declarations: [model, views],
})
`

export const accountServer = () => `import type { Implement } from '@hozu/data'
import { me, signIn, signOut } from './model.ts'

export function accountResolvers<Env>(implement: Implement<{ user: string }, Env>) {
  return [
    implement(me, (_, { session }) => ({ name: session.user })),
    implement(signIn, ({ name }, { setSession }) => {
      setSession({ user: name.trim().toLowerCase() })
      return {}
    }),
    implement(signOut, (_, { setSession }) => {
      setSession(null)
      return {}
    }),
  ]
}
`
