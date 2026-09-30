import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { printed } from '../src/commands/migrate.ts'
import { forget } from '../src/commands/migrate-ast.ts'
import { migrateForms } from '../src/commands/migrate-forms.ts'
import { migrateFreshness } from '../src/commands/migrate-freshness.ts'
import { migrateHead, suggestion } from '../src/commands/migrate-head.ts'
import { migrateLinks } from '../src/commands/migrate-links.ts'
import { migrateLists } from '../src/commands/migrate-lists.ts'
import { migrateParts } from '../src/commands/migrate-parts.ts'
import { fixture, model } from './migrate-fixture.ts'

const twice = <T extends { code: string }>(f: (s: string) => T, source: string) => {
  const once = f(source)
  forget()
  expect(f(once.code).code).toBe(once.code)
  return once
}

describe('migrate: head.redirects → head.failed', () => {
  it('keeps mapped errors, fills 404 for the rest and prints names that suggest another status', () => {
    const dir = fixture({ 'model.ts': model })
    const config = `import { project, ui } from '@hozu/core'
import { login, me } from './model.ts'
export default project({
  pages: [
    ui.page(login, {
      views: [],
      head: {
        query: me,
        input: () => ({}),
        render: () => ({ title: 'x' }),
        redirects: { Unauthorized: login },
      },
    }),
  ],
})
`
    const r = twice((s) => migrateHead(s, join(dir, 'hozu.config.ts')), config)
    expect(r.code).toContain('failed: { Unauthorized: login, Forbidden: 404, Gone: 404 },')
    expect(r.code).not.toContain('redirects')
    const messages = r.notes.map((n) => n.message)
    expect(messages).toContain('head.failed Forbidden: 404 filled (the 0.7 status); the name suggests 403')
    expect(messages).toContain('head.failed Gone: 404 filled (the 0.7 status); the name suggests 410')
  })

  it('adds head.failed when a head query declares errors and there were no redirects', () => {
    const dir = fixture({ 'model.ts': model })
    const config = `import { project, ui } from '@hozu/core'
import * as m from './model.ts'
export default project({ pages: [ui.page(m.login, { views: [], head: { query: m.me, input: () => ({}), render: () => ({ title: 'x' }) } })] })
`
    const r = twice((s) => migrateHead(s, join(dir, 'hozu.config.ts')), config)
    expect(r.code).toContain(
      "render: () => ({ title: 'x' }), failed: { Unauthorized: 404, Forbidden: 404, Gone: 404 } }",
    )
    expect(suggestion('Unauthorized')).toBe('a sign-in route')
    expect(suggestion('NotFound')).toBeNull()
  })

  it('drops empty redirects and says when it cannot see the errors', () => {
    const r = migrateHead(
      `import { ui } from '@hozu/core'\nconst p = ui.page(x, { head: { render: () => ({ title: 'x' }), redirects: {} } })\n`,
      '/nowhere/config.ts',
    )
    expect(r.code).toContain("head: { render: () => ({ title: 'x' }) }")
    const unknown = migrateHead(
      `const p = ui.page(x, { head: { query: someQuery, redirects: { A: home } } })\n`,
      '/nowhere/config.ts',
    )
    expect(unknown.code).toContain('failed: { A: home }')
    expect(unknown.notes[0]!.message).toContain('cannot read the errors of the head query someQuery')
  })
})

describe('migrate: user freshness', () => {
  it("rewrites user-scoped 'static', { swr } and { revalidate } to 'request' and nothing else", () => {
    const r = twice((s) => migrateFreshness(s, 'model.ts'), model)
    expect(r.code).toContain(
      "errors: { Unauthorized: z.object({}), Forbidden: z.object({}), Gone: z.object({}) }, scope: 'user', freshness: 'request' })",
    )
    expect(r.code).toContain("scope: 'user', freshness: 'request' })\nexport const liveItems")
    expect(r.code).toContain("freshness: 'live'")
    expect(r.code).toContain("scope: 'public', freshness: { revalidate: 60 }")
    expect(r.notes.map((n) => n.message)).toEqual([
      "user-scoped freshness 'static' → 'request': user data is read on every request",
      "user-scoped freshness { swr: 30 } → 'request': user data is read on every request",
    ])
  })
})

describe('migrate: ui.link search', () => {
  it('drops null, {} and fields equal to the route defaults', () => {
    const dir = fixture({ 'model.ts': model })
    const views = `import { ui } from '@hozu/core'
import { home, login } from './model.ts'
const a = ui.link(home, null, null)
const b = ui.link(home, null, {})
const c = ui.link(home, null, { show: 'all', q: '' })
const d = ui.link(home, null, { show: 'done', q: '' })
const e = ui.link(home, null, { show: 'all', q: ctx.q })
const f = ui.link(login, null)
`
    const defaults = new Map([['/', { show: 'all', q: '' }]])
    const r = twice((s) => migrateLinks(s, join(dir, 'views.ts'), defaults), views)
    expect(r.code).toBe(`import { ui } from '@hozu/core'
import { home, login } from './model.ts'
const a = ui.link(home, null)
const b = ui.link(home, null)
const c = ui.link(home, null)
const d = ui.link(home, null, { show: 'done' })
const e = ui.link(home, null, { q: ctx.q })
const f = ui.link(login, null)
`)
  })

  it('without the 0.7 defaults, folds only null fields', () => {
    const r = migrateLinks(
      `import { ui } from '@hozu/core'\nconst c = ui.link(home, null, { show: 'all', tag: null })\n`,
      '/x/views.ts',
    )
    expect(r.code).toContain("ui.link(home, null, { show: 'all' })")
  })
})

describe('migrate: string form attribute → ui.formRef()', () => {
  it('introduces one formRef per form id, also through a constant, and drops the unused import', () => {
    const dir = fixture({ 'model.ts': model })
    const views = `import { type Child, ui } from '@hozu/core'
import { BULK, home } from './model.ts'

export const V = (items: Child) => [
  ui.form({ id: BULK, on: {} }, []),
  ui.input({ type: 'checkbox', form: BULK, name: 'ids' }),
  ui.button({ form: 'bulk', type: 'submit' }, ['Go']),
  ui.a({ href: ui.link(home, null) }, [items]),
]
`
    const r = twice((s) => migrateForms(s, join(dir, 'views.ts')), views)
    expect(r.code).toBe(`import { type Child, ui } from '@hozu/core'
import { home } from './model.ts'

const bulk = ui.formRef()

export const V = (items: Child) => [
  ui.form({ ref: bulk, on: {} }, []),
  ui.input({ type: 'checkbox', form: bulk, name: 'ids' }),
  ui.button({ form: bulk, type: 'submit' }, ['Go']),
  ui.a({ href: ui.link(home, null) }, [items]),
]
`)
  })

  it('prints a form id no form of the module holds', () => {
    const r = migrateForms(
      `import { ui } from '@hozu/core'\nconst x = ui.input({ form: 'elsewhere' })\n`,
      '/x/v.ts',
    )
    expect(r.code).toContain("form: 'elsewhere'")
    expect(r.notes[0]!.message).toContain("form: 'elsewhere' names no form of this module")
  })
})

describe('migrate: query resolvers only read', () => {
  const server = `import type { Implement } from '@hozu/data'
import { addItem, listItems, me } from './model.ts'

export function itemResolvers<Env>(implement: Implement<{ user: string }, Env>) {
  const store = new Map<string, string[]>()
  const itemsOf = (session: { user: string } | null) => {
    if (!session) return []
    const list = store.get(session.user) ?? []
    store.set(session.user, list)
    return list
  }
  const touch = (s: string) => store.set(s, [])
  return [
    implement(listItems, (_, { session }) => itemsOf(session).map((x) => x)),
    implement(me, (_, { session }) => { touch('x'); return { name: 'a' } }),
    implement(addItem, ({ title }, { session }) => {
      itemsOf(session).unshift(title)
      return {}
    }),
  ]
}
`
  it("splits the scaffold's create-on-read itemsOf into listOf and ownListOf", () => {
    const dir = fixture({ 'model.ts': model })
    const r = twice((s) => migrateLists(s, join(dir, 'server.ts')), server)
    expect(r.code).toContain(
      '  const listOf = (session: { user: string } | null) => (session ? (store.get(session.user) ?? []) : [])\n  const ownListOf = (session: { user: string } | null) => {',
    )
    expect(r.code).toContain('implement(listItems, (_, { session }) => listOf(session).map((x) => x))')
    expect(r.code).toContain('ownListOf(session).unshift(title)')
    expect(r.notes.map((n) => n.message)).toEqual([
      "itemsOf created the user's list on read: split into listOf (1 query call) and ownListOf (writes)",
      'the resolver of query me calls touch, which calls .set(): query resolvers only read; move the write into a mutation',
    ])
  })
})

describe('migrate: create-on-read in another module', () => {
  it('prints a query resolver whose store method writes, through an imported factory', () => {
    const dir = fixture({
      'model.ts': model,
      'store.ts': `export function createStore() {
  const notes = new Map<string, string[]>()
  const of = (user: string) => {
    const list = notes.get(user) ?? []
    notes.set(user, list)
    return list
  }
  return {
    of,
    active: (user: string) => of(user).filter(Boolean),
    peek: (user: string) => notes.get(user) ?? [],
  }
}
`,
    })
    const server = `import { resolvers } from '@hozu/data'
import { listItems, me } from './model.ts'
import { createStore } from './store.ts'

const store = createStore()
export default resolvers(project, (implement) => [
  implement(listItems, (_, { session }) => store.active(session.user)),
  implement(me, (_, { session }) => ({ name: store.peek(session.user).join() })),
])
`
    const r = migrateLists(server, join(dir, 'app.ts'))
    expect(r.code).toBe(server)
    expect(r.notes.map((n) => [n.line, n.message, n.see, n.behaviour])).toEqual([
      [
        7,
        'the resolver of query listItems calls store.active, which calls .set() (store.ts:5): query resolvers only read; move the write into a mutation',
        'data',
        true,
      ],
    ])
  })
})

describe('migrate: plain helpers that receive references → part()', () => {
  it('wraps local and imported helpers, and a helper that only a new part calls', () => {
    const dir = fixture({
      'model.ts': model,
      'shared.ts': `import { ui } from '@hozu/core'\nexport function badge(label: string) {\n  return ui.span({}, [label])\n}\n`,
      'views.ts': `import { ui } from '@hozu/core'
import { badge } from './shared.ts'

const inner = (t: string) => ui.b({}, [t])
const row = (item: { title: string; done: boolean }) => ui.li({}, [item.done ? 'Done' : item.title, inner(item.title)])

export const List = ui.view({
  render: ({ ctx }) => ui.ul({}, [row(ctx.item), badge(ctx.label)]),
})
`,
    })
    const files = new Map(
      ['model.ts', 'shared.ts', 'views.ts'].map((f) => [join(dir, f), readFileSync(join(dir, f), 'utf8')]),
    )
    const first = migrateParts(files)
    for (const [f, s] of first.files) files.set(f, s)
    forget()
    const second = migrateParts(files)
    for (const [f, s] of second.files) files.set(f, s)
    const views = files.get(join(dir, 'views.ts'))!
    expect(views).toContain("import { part, ui } from '@hozu/core'")
    expect(views).toContain('const row = part((item: { title: string; done: boolean }) =>')
    expect(views).toContain('const inner = part((t: string) => ui.b({}, [t]))')
    expect(files.get(join(dir, 'shared.ts'))).toContain(
      'export const badge = part((label: string) => {\n  return ui.span({}, [label])\n})',
    )
    const notes = [...first.notes, ...second.notes].map((n) => [n.message.split(':')[0], n.behaviour])
    expect(notes).toContainEqual(['row → part()', true])
    expect(notes).toContainEqual(['badge → part() (the IR is unchanged)', false])
  })
})

describe('migrate: what it cannot rewrite is printed with its topic', () => {
  it('hand-made i18n, HTML and redirect Responses from resolvers', () => {
    const notes = [
      ...printed(
        'model.ts',
        "export const Session = z.object({ user: z.string(), lang: z.enum(['en', 'de']) })\n",
      ),
      ...printed(
        'serve.ts',
        "import { AsyncLocalStorage } from 'node:async_hooks'\nconst l = req.headers['accept-language']\n",
      ),
      ...printed(
        'server.ts',
        "implement(admin, () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }))\nimplement(home, () => new Response(null, { status: 303, headers: { location: '/' } }))\n",
      ),
      ...printed('views.ts', "ui.p({}, ['text/html is a media type'])\n"),
    ]
    expect(notes.map((n) => [n.file, n.line, n.see])).toEqual([
      ['model.ts', 1, 'i18n'],
      ['serve.ts', 1, 'i18n'],
      ['serve.ts', 2, 'i18n'],
      ['server.ts', 1, 'pages'],
      ['server.ts', 2, 'endpoints'],
    ])
    expect(notes.every((n) => n.behaviour)).toBe(true)
    expect(notes[3]!.message).toContain('HZ053')
  })

  it('every hand-built redirect or 4xx Response of a resolver module, in any argument order', () => {
    const source = `const redirect = (location: string) => new Response(null, { status: 302, headers: { location } })
export default resolvers(project, (implement) => [
  implement(landing, (_, { session }) => redirect(session ? '/notes' : '/login')),
  implement(bulk, () => {
    return new Response(null, { headers: { location: '/notes' }, status: 303 })
  }),
  implement(exportAll, (_, { session }) => {
    if (!session) return Response.json({ message: 'Sign in first' }, { status: 401 })
    return Response.json({})
  }),
  implement(gone, () => new Response('gone', { status: 410 })),
  implement(ok, () => new Response('x', { status: 200 })),
  implement(back, () => Response.redirect('/x', 307)),
])
`
    expect(printed('app.ts', source).map((n) => [n.line, n.message, n.see])).toEqual([
      [1, "a redirect Response: declare output: 'redirect' and return redirect(ui.link(…))", 'endpoints'],
      [5, "a redirect Response: declare output: 'redirect' and return redirect(ui.link(…))", 'endpoints'],
      [
        8,
        "a 401 Response: declare errors: { Name: schema } and failed: { Name: 401 }, and return fail('Name', …)",
        'endpoints',
      ],
      [
        11,
        "a 410 Response: declare errors: { Name: schema } and failed: { Name: 410 }, and return fail('Name', …)",
        'endpoints',
      ],
      [13, "a redirect Response: declare output: 'redirect' and return redirect(ui.link(…))", 'endpoints'],
    ])
  })
})
