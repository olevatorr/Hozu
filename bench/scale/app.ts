import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROWS = 100

const model = (
  id: string,
) => `import { contract, event, fn, invoke, machine, mutation, on, query, tag } from '@hozu/core'
import { z } from 'zod'

export const Item = z.object({ id: z.string(), title: z.string(), done: z.boolean(), n: z.number() })
const Items = z.array(Item)
const Key = z.object({ id: z.string() })

export const Add = event({ payload: z.object({ title: z.string() }) })
export const Toggle = event({ payload: Key })
export const Filter = event({ payload: z.object({ min: z.number() }) })

export const itemsTag = tag({ param: null })

export const listItems = query({
  input: z.object({}),
  output: Items,
  scope: 'public',
  freshness: 'static',
  tags: () => [itemsTag()],
  runs: 'server',
})

export const getItem = query({
  input: Key,
  output: Item,
  errors: { NotFound: Key },
  scope: 'public',
  freshness: { revalidate: 60 },
  tags: () => [itemsTag()],
  runs: 'server',
})

export const addItem = mutation({
  input: z.object({ title: z.string().min(2) }),
  output: Item,
  invalidates: () => [itemsTag()],
  runs: 'server',
  access: 'anyone',
})

export const toggleItem = mutation({
  input: Key,
  output: Item,
  errors: { NotFound: Key },
  invalidates: () => [itemsTag()],
  runs: 'server',
  access: 'anyone',
})

function score(n: number) {
  return n * 2 + 1
}

export const above = fn({
  input: z.object({ items: Items, min: z.number() }),
  output: Items,
  impl: ({ items, min }) => items.filter((i) => score(i.n) >= min),
})

export const total = fn({
  input: z.object({ items: Items }),
  output: z.number(),
  impl: ({ items }) => items.reduce((sum, i) => sum + score(i.n), 0),
})

export const ${id}Machine = machine({
  context: z.object({ min: z.number(), draft: z.string(), target: z.string(), error: z.string().nullable() }),
  initialContext: { min: 0, draft: '', target: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Filter, {
          target: 'idle',
          assign: (e) => {
            ctx.min = e.min
          },
        }),
        on(Add, {
          target: 'adding',
          guard: (e) => e.title !== '',
          assign: (e) => {
            ctx.draft = e.title
            ctx.error = null
          },
        }),
        on(Toggle, {
          target: 'toggling',
          assign: (e) => {
            ctx.target = e.id
          },
        }),
      ],
    },
    adding: {
      invoke: invoke(addItem, {
        input: { title: ctx.draft },
        done: {
          target: 'saved',
          assign: () => {
            ctx.draft = ''
          },
        },
        failed: {
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
    toggling: {
      invoke: invoke(toggleItem, {
        input: { id: ctx.target },
        done: 'idle',
        failed: {
          NotFound: 'idle',
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
    saved: { ignore: [Add, Toggle, Filter], after: [{ ms: 2000, target: 'idle' }] },
  }),
})

export const addsItem = contract(${id}Machine, {
  given: { state: 'idle' },
  when: [
    { send: Add, payload: { title: 'Milk' } },
    { done: addItem, result: { id: 'x', title: 'Milk', done: false, n: 1 } },
  ],
  expect: { state: 'saved', effects: [{ effect: addItem, input: { title: 'Milk' } }] },
})
`

const views = (id: string) => `import { ui } from '@hozu/core'
import { ${id}Page } from '../../routes.ts'
import { Add, above, Filter, ${id}Machine, listItems, Toggle, total } from './model.ts'

export const Board = ui.view({
  machine: ${id}Machine,
  route: ${id}Page,
  render: ({ ctx, when }) =>
    ui.main({ class: 'mx-auto max-w-xl space-y-4 p-4' }, [
      ui.h1({ class: 'text-2xl font-bold' }, ['${id}']),
      ui.form({ class: 'flex gap-2', on: { submit: ui.send(Add, { title: ui.dom.form('title') }) } }, [
        ui.input({ name: 'title', 'aria-label': 'Title', required: true, value: ctx.draft }),
        ui.button({ type: 'submit' }, ['Add']),
      ]),
      ui.div({ class: 'flex gap-2' }, [
        ui.button({ type: 'button', on: { click: ui.send(Filter, { min: 0 }) } }, ['All']),
        ui.button({ type: 'button', on: { click: ui.send(Filter, { min: 100 }) } }, ['Large']),
      ]),
      ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error]),
      when(['saved'], [ui.p({ role: 'status' }, ['Saved'])]),
      ui.query(
        listItems,
        {},
        {
          ready: (items) =>
            ui.div({}, [
              ui.p({}, ['Total: ', total({ items })]),
              ui.ul({ class: 'divide-y' }, [
                ui.each(above({ items, min: ctx.min }), 'id', (i) =>
                  ui.li({ class: 'flex justify-between py-1' }, [
                    ui.span({}, [i.title]),
                    ui.button({ type: 'button', on: { click: ui.send(Toggle, { id: i.id }) } }, ['Toggle']),
                  ]),
                ),
              ]),
            ]),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
        },
      ),
    ]),
})
`

const feature = (id: string) => `import { feature } from '@hozu/core'
import * as model from './model.ts'
import * as views from './views.ts'

export const ${id} = feature({
  id: '${id}',
  intent: { summary: 'A generated list feature for the scale benchmark (ADR 0050).' },
  declarations: [model, views],
})
`

/** Writes a Hozu app with `features` list features, one page each, under `dir` (replacing it). */
export function generateApp(dir: string, features: number) {
  rmSync(dir, { recursive: true, force: true })
  const ids = Array.from({ length: features }, (_, i) => `f${i}`)
  for (const id of ids) {
    const at = join(dir, 'features', id)
    mkdirSync(at, { recursive: true })
    writeFileSync(join(at, 'model.ts'), model(id))
    writeFileSync(join(at, 'views.ts'), views(id))
    writeFileSync(join(at, 'feature.ts'), feature(id))
  }
  writeFileSync(
    join(dir, 'routes.ts'),
    `import { route } from '@hozu/core'\n\n${ids
      .map((id) => `export const ${id}Page = route({ path: '/${id}', params: null, search: null })`)
      .join('\n')}\n`,
  )
  writeFileSync(
    join(dir, 'hozu.config.ts'),
    `import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
${ids.map((id) => `import { ${id} } from './features/${id}/feature.ts'\nimport { Board as ${id}Board } from './features/${id}/views.ts'`).join('\n')}
import { ${ids.map((id) => `${id}Page`).join(', ')} } from './routes.ts'

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'http://localhost:3000', name: 'Scale', lang: 'en' },
  routes: { ${ids.map((id) => `${id}Page`).join(', ')} },
  pages: [
${ids.map((id) => `    ui.page(${id}Page, { views: [${id}Board], head: { render: () => ({ title: '${id}' }) } }),`).join('\n')}
  ],
  features: [${ids.join(', ')}],
})
`,
  )
  writeFileSync(
    join(dir, 'app.ts'),
    `import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
${ids.map((id) => `import * as ${id} from './features/${id}/model.ts'`).join('\n')}
import project from './hozu.config.ts'

const rows = () => Array.from({ length: ${ROWS} }, (_, i) => ({ id: \`i\${i}\`, title: \`Item \${i}\`, done: false, n: i }))
const store = new Map<string, ReturnType<typeof rows>>()
const items = (feature: string) => {
  let list = store.get(feature)
  if (!list) store.set(feature, (list = rows()))
  return list
}

export default app({
  resolvers: resolvers(project, (implement) => [
${ids
  .map(
    (id) => `    implement(${id}.listItems, () => items('${id}').map((i) => ({ ...i }))),
    implement(${id}.getItem, ({ id }, { fail }) => items('${id}').find((i) => i.id === id) ?? fail('NotFound', { id })),
    implement(${id}.addItem, ({ title }) => {
      const item = { id: \`i\${items('${id}').length}\`, title, done: false, n: 1 }
      items('${id}').unshift(item)
      return { ...item }
    }),
    implement(${id}.toggleItem, ({ id }, { fail }) => {
      const item = items('${id}').find((i) => i.id === id)
      if (!item) return fail('NotFound', { id })
      item.done = !item.done
      return { ...item }
    }),`,
  )
  .join('\n')}
  ]),
})
`,
  )
  writeFileSync(join(dir, 'app.css'), '@import "tailwindcss";\n')
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: `scale-${features}`, private: true, type: 'module' }, null, 2)}\n`,
  )
  writeFileSync(
    join(dir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        extends: '../../../../tsconfig.base.json',
        compilerOptions: {
          noEmit: true,
          lib: ['es2023', 'dom'],
          allowImportingTsExtensions: true,
          declaration: false,
          declarationMap: false,
          sourceMap: false,
        },
        include: ['**/*.ts'],
        exclude: ['node_modules'],
      },
      null,
      2,
    )}\n`,
  )
}
