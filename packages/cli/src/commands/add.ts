import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import type { AddOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function namesOf(name: string) {
  const one = name.endsWith('s') && name.length > 1 ? name.slice(0, -1) : name
  const many = name.endsWith('s') ? name : `${name}s`
  return {
    id: name,
    Item: cap(one),
    New: `New${cap(one)}`,
    list: `list${cap(many)}`,
    add: `add${cap(one)}`,
    tag: `${name}Tag`,
    machine: `${name}Machine`,
    View: `${cap(name)}Board`,
    feature: name,
    resolvers: `${name}Resolvers`,
    title: cap(name),
    one,
  }
}

type Names = ReturnType<typeof namesOf>

const model = (n: Names) => `import { event, invoke, machine, mutation, on, op, query, tag } from '@hozu/core'
import { z } from 'zod'

export const ${n.Item} = z.object({ id: z.string(), title: z.string() })
export const ${n.New} = z.object({
  title: z.string().min(2, 'Use at least 2 characters').max(80, 'Use at most 80 characters'),
})

export const Draft = event({ payload: z.object({ text: z.string() }) })
export const Add = event({ payload: z.object({ title: z.string() }) })

export const ${n.tag} = tag({ param: null })

export const ${n.list} = query({
  input: z.object({}),
  output: z.array(${n.Item}),
  scope: 'public',
  freshness: 'static',
  tags: () => [${n.tag}()],
})

export const ${n.add} = mutation({
  input: ${n.New},
  output: ${n.Item},
  errors: { Duplicate: z.object({ title: z.string() }) },
  invalidates: () => [${n.tag}()],
})

export const DUPLICATE = 'This ${n.one} already exists'

export const ${n.machine} = machine({
  context: z.object({
    draft: z.string(),
    error: z.string().nullable(),
    fields: z.object({ title: z.string().nullable() }),
  }),
  initialContext: { draft: '', error: null, fields: { title: null } },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.text)] }),
        on(Add, {
          target: 'adding',
          assign: (e) => [
            op.set(ctx.draft, e.title),
            op.set(ctx.error, null),
            op.set(ctx.fields, { title: null }),
          ],
        }),
      ],
    },
    adding: {
      ignore: [Draft, Add],
      invoke: invoke(${n.add}, {
        input: { title: ctx.draft },
        done: [{ target: 'idle', assign: () => [op.set(ctx.draft, '')] }],
        failed: {
          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, DUPLICATE)] }],
          Invalid: [{ target: 'idle', assign: (e) => [op.set(ctx.fields, e.fields)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
  }),
})
`

const views = (n: Names) => `import { contract, feature, op, ui } from '@hozu/core'
import { Add, ${n.add}, DUPLICATE, Draft, ${n.list}, ${n.machine}, ${n.tag} } from './model.ts'

export const ${n.View} = ui.view({
  machine: ${n.machine},
  render: ({ ctx, when }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-12' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['${n.title}']),
      ui.form({ class: 'flex gap-2', on: { submit: ui.send(Add, { title: ui.dom.form('title') }) } }, [
        ui.label({ for: '${n.id}-title', class: 'sr-only' }, ['Title']),
        ui.input({
          id: '${n.id}-title',
          name: 'title',
          required: true,
          minlength: 2,
          maxlength: 80,
          value: ctx.draft,
          'aria-invalid': op.neq(ctx.fields.title, null),
          'aria-describedby': '${n.id}-title-error',
          class: 'flex-1 rounded border px-3 py-2',
          on: { input: ui.send(Draft, { text: ui.dom.value }) },
        }),
        ui.button({ type: 'submit', class: 'rounded bg-indigo-600 px-4 py-2 text-white' }, ['Add']),
      ]),
      ui.p({ id: '${n.id}-title-error', class: 'text-sm text-rose-600' }, [ctx.fields.title]),
      ui.if(op.neq(ctx.error, null), [ui.p({ role: 'alert', class: 'text-rose-600' }, [ctx.error])], []),
      when(['adding'], [ui.p({ class: 'opacity-50', 'aria-busy': 'true' }, ['Adding ', ctx.draft, '…'])]),
      ui.query(
        ${n.list},
        {},
        {
          ready: (items) =>
            ui.ul({ class: 'divide-y rounded border' }, [
              ui.each(items, 'id', (item) => ui.li({ class: 'px-4 py-3' }, [item.title])),
            ]),
          pending: ui.p({}, ['Loading…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
        },
      ),
    ]),
})

export const typesDraft = contract(${n.machine}, {
  given: { state: 'idle' },
  when: [{ send: Draft, payload: { text: 'Ship' } }],
  expect: { state: 'idle', changes: { draft: 'Ship' } },
})

export const adds = contract(${n.machine}, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { title: 'Ship' } },
    { done: ${n.add}, result: { id: 'x1', title: 'Ship' } },
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
})

export const ${n.feature} = feature({
  id: '${n.id}',
  intent: { summary: '${n.title}: add one with a title; titles are unique, case-insensitive.' },
  declarations: {
    Draft,
    Add,
    ${n.tag},
    ${n.list},
    ${n.add},
    ${n.machine},
    ${n.View},
    typesDraft,
    adds,
    rejectsDuplicate,
    rejectsInvalid,
    addFails,
  },
})
`

const server = (n: Names) => `import type { Implement } from '@hozu/data'
import { ${n.add}, ${n.list} } from './model.ts'

export function ${n.resolvers}<Session, Env>(implement: Implement<Session, Env>) {
  const items: { id: string; title: string }[] = []
  let seq = 0
  return [
    implement(${n.list}, () => items.map((item) => ({ ...item }))),
    implement(${n.add}, ({ title }, { fail }) => {
      const clean = title.trim()
      if (items.some((item) => item.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      const item = { id: \`${n.one.charAt(0)}\${++seq}\`, title: clean }
      items.unshift(item)
      return { ...item }
    }),
  ]
}
`

const addImport = (source: string, line: string): string | null => {
  const imports = [...source.matchAll(/^import[\s\S]*?from '[^']+'\n/gm)]
  const last = imports.at(-1)
  if (!last) return null
  const at = last.index + last[0].length
  return source.slice(0, at) + line + source.slice(at)
}

const append = (source: string, pattern: RegExp, item: string): string | null => {
  const m = pattern.exec(source)
  if (!m) return null
  const inner = m[1]!.trim().replace(/,$/, '')
  const replaced = m[0].replace(m[1]!, inner ? `${inner}, ${item}` : item)
  return source.slice(0, m.index) + replaced + source.slice(m.index + m[0].length)
}

export async function runAddFeature(
  cwd: string,
  config: string | undefined,
  name: string | undefined,
  page: string | undefined,
): Promise<AddOutput> {
  if (!name || !/^[a-z][a-zA-Z0-9]*$/.test(name))
    throw new HozuCliError('usage', 'Give the feature a lower-case identifier', [
      'hozu add feature tasks --page /',
    ])
  if (page !== undefined && !/^\/[\w/-]*$/.test(page))
    throw new HozuCliError('usage', '--page must be a static path such as / or /tasks', [
      'Routes with params are written by hand: route({ path: "/tasks/:id", params: z.object({ id: z.string() }), search: null })',
    ])
  const configPath = resolve(cwd, config ?? 'hozu.config.ts')
  const root = dirname(configPath)
  const dir = join(root, 'features', name)
  if (existsSync(dir)) throw new HozuCliError('usage', `features/${name} already exists`, [])
  const n = namesOf(name)
  const out: AddOutput = { created: [], edited: [], manual: [] }
  await mkdir(dir, { recursive: true })
  for (const [file, text] of [
    ['model.ts', model(n)],
    ['views.ts', views(n)],
    ['server.ts', server(n)],
  ] as const) {
    await writeFile(join(dir, file), text)
    out.created.push(relative(cwd, join(dir, file)))
  }
  const edit = async (file: string, change: (s: string) => string | null, manual: string) => {
    const path = join(root, file)
    const source = existsSync(path) ? await readFile(path, 'utf8') : null
    const next = source === null ? null : change(source)
    if (next === null) out.manual.push(`${file}: ${manual}`)
    else {
      await writeFile(path, next)
      if (!out.edited.includes(relative(cwd, path))) out.edited.push(relative(cwd, path))
    }
  }
  await edit(
    'server.ts',
    (s) => {
      const wired = s.replace(
        /resolvers\(project,\s*\((?:implement)?\)\s*=>\s*\[/,
        `resolvers(project, (implement) => [\n    ...${n.resolvers}(implement),`,
      )
      return wired === s
        ? null
        : addImport(wired, `import { ${n.resolvers} } from './features/${name}/server.ts'\n`)
    },
    `import { ${n.resolvers} } from './features/${name}/server.ts' and add ...${n.resolvers}(implement) to resolvers(project, (implement) => [...])`,
  )
  let pageRoute: string | null = null
  let newRoute = false
  if (page !== undefined) {
    const routesPath = join(root, 'routes.ts')
    const routes = existsSync(routesPath) ? await readFile(routesPath, 'utf8') : ''
    const existing = new RegExp(
      `export const (\\w+) = route\\(\\{\\s*path: '${page.replace(/[/-]/g, '\\$&')}'`,
    ).exec(routes)
    pageRoute = existing?.[1] ?? `${name}Page`
    newRoute = !existing
    if (newRoute)
      await edit(
        'routes.ts',
        (s) =>
          `${s.trimEnd()}\nexport const ${pageRoute} = route({ path: '${page}', params: null, search: null })\n`,
        `export const ${pageRoute} = route({ path: '${page}', params: null, search: null })`,
      )
  }
  await edit(
    config ?? 'hozu.config.ts',
    (s) => {
      let next: string | null = addImport(
        s,
        `import { ${n.View}, ${n.feature} } from './features/${name}/views.ts'\n`,
      )
      if (next) next = append(next, /features:\s*\[([^\]]*)\]/, n.feature)
      if (next && pageRoute && newRoute) {
        next = append(next, /routes:\s*\{([^}]*)\}/, pageRoute)
        next =
          next?.replace(/import \{([^}]*)\} from '\.\/routes\.ts'/, (all, names: string) =>
            all.replace(
              names,
              ` ${[
                ...names
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
                pageRoute,
              ]
                .sort()
                .join(', ')} `,
            ),
          ) ?? null
        next =
          next?.replace(
            /pages:\s*\[/,
            (m) =>
              `${m}\n    ui.page(${pageRoute}, { views: [${n.View}], head: { render: () => ({ title: '${n.title}' }) } }),`,
          ) ?? null
      } else if (next && pageRoute) {
        const views = new RegExp(`ui\\.page\\(\\s*${pageRoute}\\s*,\\s*\\{\\s*views:\\s*\\[[^\\]]*\\]`)
        next = views.test(next) ? next.replace(views, `ui.page(${pageRoute}, { views: [${n.View}]`) : null
      }
      return next
    },
    `import { ${n.View}, ${n.feature} } from './features/${name}/views.ts', add ${n.feature} to features${pageRoute ? ` and ui.page(${pageRoute}, { views: [${n.View}], head: { render: () => ({ title: '${n.title}' }) } }) to pages` : ''}`,
  )
  return out
}

export function describeAdd(out: AddOutput): string {
  const lines = [
    ...out.created.map((f) => `created ${f}`),
    ...out.edited.map((f) => `edited  ${f}`),
    ...out.manual.map((m) => `todo    ${m}`),
    'next    hozu check',
  ]
  return `${lines.join('\n')}\n`
}
