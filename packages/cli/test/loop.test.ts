import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Ajv } from 'ajv'
import { createApp } from 'create-hozu'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { findBrowser } from '../src/cdp.ts'
import { bundleSpec } from '../src/commands/add-component.ts'
import { formsOf } from '../src/commands/request.ts'
import { main } from '../src/main.ts'

vi.setConfig({ testTimeout: 30_000 })

const root = fileURLToPath(new URL('../../../', import.meta.url))
const ajv = new Ajv({ allErrors: true, strict: false })
const schema = (name: string) =>
  JSON.parse(readFileSync(`${root}packages/cli/schema/${name}.schema.json`, 'utf8'))
const skillSource = `${root}.claude/skills/hozu`

async function run(args: string[], cwd: string) {
  let stdout = ''
  const code = await main(args, cwd, (s) => {
    stdout += s
  })
  return { code, stdout }
}

const json = async (name: string, args: string[], cwd: string) => {
  const { code, stdout } = await run([...args, '--json'], cwd)
  const out = JSON.parse(stdout)
  expect(ajv.validate(schema(name), out), JSON.stringify(ajv.errors)).toBe(true)
  return { code, out }
}

const chrome = findBrowser() !== null
const browse = (args: string[], cwd: string) => json('browse', ['browse', ...args], cwd)
const steps = (...list: string[]) => list.flatMap((step) => ['--do', step])
const addedBy = (out: { steps: { modes: { added: string[] }[] }[] }, i: number) =>
  out.steps[i]!.modes.map((m) => m.added)

const created: string[] = []
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

async function freshApp() {
  const dir = join(root, '.tmp', `loop-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dirname(dir), { recursive: true })
  await createApp(dir, { name: 'loop', agent: 'claude', version: '0.2.0', runner: 'npx', skillSource })
  created.push(dir)
  return dir
}

const dirname = (p: string) => p.slice(0, p.lastIndexOf('/'))

describe('the agent loop (ADR 0027)', () => {
  it('scaffolds a feature on the home page that checks clean and renders through get', async () => {
    const app = await freshApp()
    const added = await json('add', ['add', 'feature', 'tasks', '--page', '/'], app)
    expect(added.out.created).toHaveLength(5)
    expect(added.out.created).toContain('hozu.lock.json')
    expect(added.out.manual).toEqual([])
    const check = await json('check', ['check'], app)
    expect(check.code).toBe(0)
    expect(check.out.types).toEqual({ ok: true, skipped: false, errors: [] })
    expect(check.out.validate.summary).toEqual({ errors: 0, warnings: 0 })

    const home = await json('request', ['get', '/'], app)
    expect(home.out.steps[0]).toMatchObject({ method: 'GET', path: '/', status: 200, alerts: [] })
    expect(home.out.steps[0].text).toContain('Tasks')
  })

  it.skipIf(!chrome)(
    'adds through the scaffolded form with and without JS, with the same alerts',
    async () => {
      const app = await freshApp()
      await run(['add', 'feature', 'tasks', '--page', '/'], app)
      const flow = await browse(
        [
          '/',
          ...steps(
            'fill Title=  Ship it ',
            'press Enter',
            'fill Title=ship IT',
            'press Enter',
            'fill Title=x',
          ),
          ...steps('press Enter'),
        ],
        app,
      )
      expect(flow.code).toBe(0)
      expect(flow.out.modes).toEqual(['on', 'off'])
      expect(addedBy(flow.out, 1)).toEqual([
        expect.arrayContaining(['Ship it']),
        expect.arrayContaining(['Ship it']),
      ])
      expect(addedBy(flow.out, 3)).toEqual([['This task already exists'], ['This task already exists']])
      expect(addedBy(flow.out, 5)).toEqual([['Use at least 2 characters'], ['Use at least 2 characters']])
      expect(flow.out.steps.some((s: { differs?: boolean }) => s.differs)).toBe(false)
    },
    60_000,
  )

  it('adds a second feature on its own route', async () => {
    const app = await freshApp()
    await run(['add', 'feature', 'tasks', '--page', '/'], app)
    const notes = await json('add', ['add', 'feature', 'notes', '--page', '/notes'], app)
    expect(notes.out.edited).toEqual(expect.arrayContaining(['routes.ts', 'hozu.config.ts', 'app.ts']))
    expect((await run(['check'], app)).code).toBe(0)
    const page = await json('request', ['get', '/notes'], app)
    expect(page.out.steps[0]).toMatchObject({ status: 200 })
    expect(page.out.steps[0].text).toContain('Notes')
  })

  it('reports type errors and refuses what it cannot do', async () => {
    const app = await freshApp()
    writeFileSync(join(app, 'broken.ts'), 'export const n: number = "text"\n')
    const check = await json('check', ['check'], app)
    expect(check.code).toBe(1)
    expect(check.out.types.errors[0]).toMatchObject({ file: 'broken.ts', line: 1, code: 'TS2322' })
    expect((await run(['add', 'feature', 'Bad'], app)).code).toBe(2)
    const post = await run(['post', '/', '--json'], app)
    expect([post.code, JSON.parse(post.stdout).error.message]).toEqual([
      2,
      expect.stringContaining('replaced by hozu browse'),
    ])
    const migrate = await run(['migrate', '0.9', '--json'], app)
    expect([migrate.code, JSON.parse(migrate.stdout).error.message]).toEqual([
      2,
      expect.stringContaining('0.9 has no migration tool'),
    ])
  })

  it('reads forms like a browser: defaults, checkbox groups, form= controls and submit buttons', () => {
    const html = `
      <form method="post" action="/?__hozu=a"><input name="title" value="x"><select name="kind"><option value="a">A</option><option value="b" selected>B</option></select><button type="submit">Add</button></form>
      <form method="post" action="/?__hozu=b"><input type="hidden" name="id" value="t1"><button>Mark done</button></form>
      <form method="post" action="/?__hozu=c" id="bulk" aria-label="Bulk"><input type="checkbox" name="ids" value="n1" checked><input type="checkbox" name="ids" value="n2"><button type="submit" name="action" value="delete">Delete</button><button type="button">Cancel</button></form>
      <ul><li><input type="checkbox" name="ids" value="n3" form="bulk"></li></ul><button type="submit" name="action" value="archive" form="bulk">Archive</button>
      <form action="/search"><input name="q" type="search"></form>`
    const [add, done, bulk, search] = formsOf(html, '/')
    const field = (name: string, value: string, kind = 'text') => ({ name, value, kind, outside: false })
    expect(add).toEqual({
      action: '/?__hozu=a',
      method: 'post',
      id: null,
      label: null,
      fields: [field('title', 'x'), field('kind', 'b', 'select')],
      groups: [],
      buttons: [{ text: 'Add', name: null, value: null, outside: false }],
    })
    expect(done!.fields).toEqual([field('id', 't1', 'hidden')])
    expect(bulk).toMatchObject({ id: 'bulk', label: 'Bulk', fields: [] })
    expect(bulk!.groups).toEqual([
      {
        name: 'ids',
        type: 'checkbox',
        options: [
          { value: 'n1', checked: true },
          { value: 'n2', checked: false },
          { value: 'n3', checked: false },
        ],
        outside: true,
      },
    ])
    expect(bulk!.buttons).toEqual([
      { text: 'Delete', name: 'action', value: 'delete', outside: false },
      { text: 'Archive', name: 'action', value: 'archive', outside: true },
    ])
    expect(search).toMatchObject({ method: 'get', fields: [field('q', '', 'search')], buttons: [] })
  })

  it('checks clean for every combination of --with parts', async () => {
    const parts = ['detail', 'toggle', 'filter', 'remove']
    for (let mask = 0; mask < 16; mask++) {
      const chosen = parts.filter((_, i) => mask & (1 << i))
      const app = await freshApp()
      const args = [
        'add',
        'feature',
        'tasks',
        '--page',
        '/',
        ...(chosen.length ? ['--with', chosen.join(',')] : []),
      ]
      const added = await json('add', args, app)
      expect(added.out.manual, chosen.join(',')).toEqual([])
      const check = await json('check', ['check'], app)
      expect(check.out.types.errors, chosen.join(',')).toEqual([])
      expect(check.out.validate.summary, chosen.join(',')).toEqual({ errors: 0, warnings: 0 })
    }
  }, 120_000)

  it.skipIf(!chrome)(
    'runs the full scaffold like a user: toggle, detail, remove and a 404',
    async () => {
      const app = await freshApp()
      await run(['add', 'feature', 'tasks', '--page', '/', '--with', 'detail,toggle,filter,remove'], app)
      const flow = await browse(
        [
          '/',
          ...steps('fill Title=Ship it', 'press Enter', 'click Mark done in "Ship it"', 'click Ship it'),
          ...steps('goto /', 'click Delete in "Ship it"', 'goto /tasks/t1'),
        ],
        app,
      )
      expect(addedBy(flow.out, 3)).toEqual([
        ['Ship it', 'Status: done', 'Back'],
        ['Ship it', 'Status: done', 'Back'],
      ])
      expect(flow.out.steps[5].modes.map((m: { removed: string[] }) => m.removed)).toEqual([
        expect.arrayContaining(['Ship it']),
        expect.arrayContaining(['Ship it']),
      ])
      expect(addedBy(flow.out, 6)).toEqual([
        expect.arrayContaining(['Not found']),
        expect.arrayContaining(['Not found']),
      ])
      expect(flow.out.errors.map((e: { text: string; mode: string }) => `${e.mode} ${e.text}`)).toEqual([
        'on 404 /tasks/t1',
        'off 404 /tasks/t1',
      ])
    },
    60_000,
  )

  it('maps an app in a couple of kilobytes, with file:line for every declaration', async () => {
    for (const example of ['bookmarks', 'trial-0007']) {
      const cwd = join(root, 'examples', example)
      const { code, stdout } = await run(['map'], cwd)
      expect(code).toBe(0)
      expect(stdout.length, example).toBeLessThan(2048)
      expect(stdout).toMatch(/state idle\*: /)
      expect(stdout).toMatch(/model\.ts:\d+/)
      await json('map', ['map'], cwd)
    }
    const notes = await run(['map'], join(root, 'examples', 'notes'))
    expect(notes.stdout).toMatch(/^ {2}parts itemForm features\/notes\/views\.ts:\d+$/m)
    expect(notes.stdout.length).toBeLessThan(3584)
  })

  it('starts with the session shape, the verify line and the files with their roles (ADR 0043 K)', async () => {
    const notes = await run(['map'], join(root, 'examples', 'notes'))
    expect(notes.stdout.split('\n').slice(0, 4)).toEqual([
      'session { user: string }',
      `verify npx hozu browse / --session '{"user":"ada"}' --js both --do '…'`,
      'files',
      '  app.ts app resolvers',
    ])
    expect(notes.stdout).toMatch(/^ {2}features\/notes\/model\.ts .*\bmachine\b/m)
    const bookmarks = await run(['map'], join(root, 'examples', 'bookmarks'))
    expect(bookmarks.stdout).toMatch(/^session none\nverify npx hozu browse \/ --js both --do '…'\n/)
  })

  it('shows attributes and forms without a server, and lists the texts a scaffold wants edited', async () => {
    const app = await freshApp()
    const added = await json(
      'add',
      ['add', 'feature', 'tasks', '--page', '/', '--with', 'detail,toggle,filter,remove'],
      app,
    )
    expect(added.out.declarations.views).toEqual(['TasksBoard', 'TaskDetail'])
    expect(added.out.texts.map((t: { text: string }) => t.text)).toEqual(
      expect.arrayContaining([
        'Tasks',
        'Add',
        'Mark done',
        'No items',
        'Not found',
        'Status: ',
        'This task already exists',
      ]),
    )
    for (const t of added.out.texts as { file: string; line: number; text: string }[])
      expect(readFileSync(join(app, t.file), 'utf8').split('\n')[t.line - 1], t.text).toContain(t.text)
    const page = await json('request', ['get', '/', '--select', 'button[aria-pressed=true]', '--forms'], app)
    const last = page.out.steps.at(-1)
    expect(last.elements[0]).toMatchObject({ tag: 'button', attrs: { 'aria-pressed': 'true' }, text: 'All' })
    expect(last.forms.map((f: { buttons: { text: string }[] }) => f.buttons[0]?.text)).toEqual(['Add'])
    expect(last.forms[0].fields.map((f: { name: string }) => f.name)).toEqual(['title'])
    expect((await run(['get', '/', '--select', 'div > p'], app)).code).toBe(2)
  })

  it('scaffolds accounts: sign in, per-user data, sign out, and a second feature reusing the account', async () => {
    const app = await freshApp()
    const added = await json(
      'add',
      ['add', 'feature', 'notes', '--page', '/', '--with', 'auth,detail,toggle,filter,remove'],
      app,
    )
    expect(added.out.created).toEqual(
      expect.arrayContaining(['features/account/model.ts', 'features/account/views.ts']),
    )
    expect(added.out.edited).toEqual(expect.arrayContaining(['app.ts', 'routes.ts', 'hozu.config.ts']))
    expect(added.out.manual).toEqual([])
    const check = await json('check', ['check'], app)
    expect(check.out.types.errors).toEqual([])
    expect(check.out.validate.summary).toEqual({ errors: 0, warnings: 0 })
    expect(readFileSync(join(app, 'app.ts'), 'utf8')).not.toContain('session:')
    const signedOut = await json('request', ['get', '/'], app)
    expect(signedOut.out.steps[0]).toMatchObject({ status: 303, location: '/login' })
    if (chrome) {
      const flow = await browse(
        [
          '/login',
          ...steps('fill Name=ada', 'press Enter', 'fill Title=Milk', 'press Enter', 'click Sign out'),
          ...steps('fill Name=bob', 'press Enter', 'goto /notes/n1'),
        ],
        app,
      )
      expect(addedBy(flow.out, 1)).toEqual([
        expect.arrayContaining(['Signed in as ada']),
        expect.arrayContaining(['Signed in as ada']),
      ])
      expect(addedBy(flow.out, 3)).toEqual([
        expect.arrayContaining(['Milk']),
        expect.arrayContaining(['Milk']),
      ])
      expect(flow.out.steps[4].modes.map((m: { url: string }) => m.url)).toEqual(['/login', '/login'])
      expect(addedBy(flow.out, 7)).toEqual([
        expect.arrayContaining(['Not found']),
        expect.arrayContaining(['Not found']),
      ])
    }
    const second = await json('add', ['add', 'feature', 'tasks', '--page', '/tasks', '--with', 'auth'], app)
    expect(second.out.created.some((f: string) => f.startsWith('features/account/'))).toBe(false)
    const again = await checkFresh(app)
    expect([again.validate.diagnostics, again.validate.lock]).toEqual([[], 'current'])
    const fresh = await promisify(execFile)(
      process.execPath,
      [`${root}packages/cli/bin/hozu.js`, 'get', '/tasks', '--json'],
      {
        cwd: app,
      },
    )
    expect(JSON.parse(fresh.stdout).steps[0]).toMatchObject({ status: 303, location: '/login' })
  }, 60_000)
})

const checkFresh = async (app: string) => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [`${root}packages/cli/bin/hozu.js`, 'check', '--json'],
    { cwd: app },
  ).catch((e: { stdout: string }) => e)
  return JSON.parse(stdout)
}

describe('ordinary TypeScript in a scaffolded app (ADR 0039)', () => {
  it('checks clean, renders the branch it chose, and rejects a method on a reference', async () => {
    const app = await freshApp()
    await run(['add', 'feature', 'tasks', '--page', '/'], app)
    const views = join(app, 'features/tasks/views.ts')
    const heading = "ui.h1({ class: 'text-3xl font-bold' }, ['Tasks']),"
    const text = readFileSync(views, 'utf8')
    expect(text).toContain(heading)
    writeFileSync(
      views,
      text.replace(
        heading,
        `${heading}\n      ui.p({}, [ctx.error ? 'Failed' : 'Fine', ctx.draft === '' && ui.span({}, [' · empty'])]),`,
      ),
    )
    const check = await checkFresh(app)
    expect(check.types.errors).toEqual([])
    expect(check.validate.summary).toEqual({ errors: 0, warnings: 0 })
    const page = await promisify(execFile)(
      process.execPath,
      [`${root}packages/cli/bin/hozu.js`, 'get', '/', '--json'],
      {
        cwd: app,
      },
    )
    expect(JSON.parse(page.stdout).steps[0].text).toContain('Fine · empty')
    writeFileSync(
      views,
      readFileSync(views, 'utf8').replace("ctx.error ? 'Failed' : 'Fine'", 'ctx.draft.toUpperCase()'),
    )
    const bad = await checkFresh(app)
    const d = bad.validate.diagnostics.find((x: { code: string }) => x.code === 'HZ059')
    expect(d.message).toMatch(/Method "toUpperCase" cannot run on a reference/)
    expect(d.location.source.file).toBe('features/tasks/views.ts')
  }, 60_000)
})

describe('hozu add component (ADR 0045 I, phase 4)', () => {
  it('--client declares, registers, bundles and depends on the component, so check is clean', async () => {
    const app = await freshApp()
    await run(['add', 'feature', 'tasks', '--page', '/'], app)
    const before = await json('check', ['check'], app)
    expect(before.out.validate.summary).toEqual({ errors: 0, warnings: 0 })
    const widget = await run(['add', 'widget', 'tasks', 'Chart', '--json'], app)
    expect([widget.code, JSON.parse(widget.stdout).error.message]).toEqual([
      2,
      expect.stringContaining('replaced by hozu add component --client'),
    ])
    const added = await json('add', ['add', 'component', 'tasks', 'Chart', '--client'], app)
    expect(added.out.created).toEqual(['features/tasks/components.ts', 'features/tasks/chart.client.ts'])
    expect(added.out.edited).toEqual([
      'features/tasks/views.ts',
      'features/tasks/feature.ts',
      'app.ts',
      'package.json',
    ])
    expect(readFileSync(join(app, 'app.ts'), 'utf8')).toContain('components: bundleComponents,')
    const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@hozu/bundle']).toBe(pkg.dependencies['@hozu/core'])
    const views = join(app, 'features/tasks/views.ts')
    const heading = "ui.h1({ class: 'text-3xl font-bold' }, ['Tasks']),"
    writeFileSync(
      views,
      readFileSync(views, 'utf8').replace(
        heading,
        `${heading}\n      ui.use(Chart, { props: {}, class: 'h-64 w-full' }),`,
      ),
    )
    const check = await checkFresh(app)
    expect(check.types.errors).toEqual([])
    expect(check.validate.summary).toEqual({ errors: 0, warnings: 0 })
    const entry = join(app, 'app.ts')
    writeFileSync(entry, readFileSync(entry, 'utf8').replace('components: bundleComponents,', ''))
    const missing = await checkFresh(app)
    expect(missing.validate.diagnostics.map((d: { code: string }) => d.code)).toEqual(['HZ045'])
    expect(missing.validate.diagnostics[0].message).toContain('tasks.Chart')
  }, 60_000)
  it('adds a pure component to a feature and to a kit', async () => {
    const app = await freshApp()
    await run(['add', 'feature', 'tasks', '--page', '/'], app)
    const feature = await json('add', ['add', 'component', 'tasks', 'Badge'], app)
    expect([feature.out.created, feature.out.edited]).toEqual([
      ['features/tasks/components.ts'],
      ['features/tasks/views.ts', 'features/tasks/feature.ts'],
    ])
    await run(['add', 'kit', 'ui'], app)
    const kit = await json('add', ['add', 'component', 'ui', 'Card'], app)
    expect([kit.out.created, kit.out.edited]).toEqual([['ui/card.ts'], ['ui/kit.ts']])
    expect(readFileSync(join(app, 'ui/kit.ts'), 'utf8')).toContain('components: [card]')
    const check = await checkFresh(app)
    expect(check.types.errors).toEqual([])
    expect(check.validate.summary).toEqual({ errors: 0, warnings: 0 })
    expect((await run(['add', 'component', 'nowhere', 'Card'], app)).code).toBe(2)
  }, 60_000)
  it('depends on the bundle tarball next to a core tarball (ADR 0040 C)', () => {
    expect(bundleSpec('file:/tmp/tgz/hozu-core-0.6.0.tgz')).toBe('file:/tmp/tgz/hozu-bundle-0.6.0.tgz')
    expect(bundleSpec('^0.6.0')).toBe('^0.6.0')
    expect(bundleSpec(undefined)).toBe('latest')
  })
})

describe('the guide compiles (ADR 0037 D2)', () => {
  it("the feature topic's example checks clean and works in a fresh app", async () => {
    const app = await freshApp()
    const skill = readFileSync(`${skillSource}/topics/feature.md`, 'utf8')
    const block = /## A feature in one screen\n```ts\n([\s\S]*?)```/.exec(skill)![1]!
    const resolver = /`(implement\(addItem, [^`]*)`/.exec(skill)![1]!
    mkdirSync(join(app, 'features/todos'), { recursive: true })
    const pieces = block.split(/^\/\/ (\w+\.ts)\n/m).slice(1)
    const parts = Object.fromEntries(pieces.flatMap((x, i) => (i % 2 ? [] : [[x, pieces[i + 1]!] as const])))
    const heads: Record<string, string> = {
      'model.ts':
        "import { event, invoke, machine, mutation, on, query, tag } from '@hozu/core'\nimport { z } from 'zod'\n",
      'views.ts': "import { ui } from '@hozu/core'\nimport { Add, items, listItems } from './model.ts'\n",
      'feature.ts': "import { feature } from '@hozu/core'\n",
    }
    expect(Object.keys(parts)).toEqual(['model.ts', 'views.ts', 'feature.ts'])
    for (const [file, text] of Object.entries(parts))
      writeFileSync(join(app, 'features/todos', file), `${heads[file]}${text}`)
    writeFileSync(
      join(app, 'app.ts'),
      `import { resolvers } from '@hozu/data'\nimport { app } from '@hozu/runtime-server'\nimport { addItem, listItems } from './features/todos/model.ts'\nimport project from './hozu.config.ts'\n\nconst list: { id: string; title: string; done: boolean }[] = []\nconst save = (title: string) => {\n  const item = { id: String(list.length + 1), title, done: false }\n  list.push(item)\n  return item\n}\n\nexport default app({\n  resolvers: resolvers(project, (implement) => [\n    implement(listItems, () => list.map((i) => ({ ...i }))),\n    ${resolver.replace('exists', 'list.some((i) => i.title === title)')},\n  ]),\n})\n`,
    )
    const config = join(app, 'hozu.config.ts')
    writeFileSync(
      config,
      readFileSync(config, 'utf8')
        .replace(
          /import \{ site \} from '[^']+'\nimport \{ Home \} from '[^']+'\n/,
          "import { todos } from './features/todos/feature.ts'\nimport { Board } from './features/todos/views.ts'\n",
        )
        .replace(/views: \[Home\]/, 'views: [Board]')
        .replace(/features: \[site\]/, 'features: [todos]'),
    )
    rmSync(join(app, 'features/site'), { recursive: true, force: true })
    const first = await checkFresh(app)
    expect(first.types.errors).toEqual([])
    expect(first.validate.diagnostics.map((d: { code: string }) => d.code)).toEqual(['HZ057'])
    expect(first.validate.lock).toBe('stale')
    await promisify(execFile)(
      process.execPath,
      [`${root}packages/cli/bin/hozu.js`, 'check', '--update-lock'],
      {
        cwd: app,
      },
    )
    const check = await checkFresh(app)
    expect([check.validate.diagnostics, check.validate.lock]).toEqual([[], 'current'])
    if (!chrome) return
    const flow = await browse(
      ['/', ...steps('fill Title=Milk', 'press Enter', 'fill Title=Milk', 'press Enter')],
      app,
    )
    expect(addedBy(flow.out, 1)).toEqual([expect.arrayContaining(['Milk']), expect.arrayContaining(['Milk'])])
    expect(addedBy(flow.out, 3)).toEqual([['Already listed'], ['Already listed']])
  }, 60_000)
})
