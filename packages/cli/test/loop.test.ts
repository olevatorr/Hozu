import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Ajv } from 'ajv'
import { createApp } from 'create-hozu'
import { afterAll, describe, expect, it } from 'vitest'
import { formsOf } from '../src/commands/request.ts'
import { main } from '../src/main.ts'

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
  it('scaffolds a feature on the home page that checks clean and works through get and post', async () => {
    const app = await freshApp()
    const added = await json('add', ['add', 'feature', 'tasks', '--page', '/'], app)
    expect(added.out.created).toHaveLength(3)
    expect(added.out.manual).toEqual([])
    const check = await json('check', ['check'], app)
    expect(check.code).toBe(0)
    expect(check.out.types).toEqual({ ok: true, skipped: false, errors: [] })
    expect(check.out.validate.summary).toEqual({ errors: 0, warnings: 0 })

    const home = await json('request', ['get', '/'], app)
    expect(home.out.steps[0]).toMatchObject({ method: 'GET', path: '/', status: 200, alerts: [] })
    expect(home.out.steps[0].text).toContain('Tasks')

    const flow = await json(
      'request',
      ['post', '/', '--field', 'title=  Ship it ', '--next', 'POST / title=ship IT', '--next', 'GET /'],
      app,
    )
    expect(flow.out.steps.map((s: { method: string; status: number }) => `${s.method} ${s.status}`)).toEqual([
      'POST 303',
      'GET 200',
      'POST 200',
      'GET 200',
    ])
    expect(flow.out.steps[1].text).toContain('Ship it')
    expect(flow.out.steps[2].alerts).toEqual(['This task already exists'])

    const invalid = await json('request', ['post', '/', '--field', 'title=x'], app)
    expect(invalid.out.steps[0].text).toContain('Use at least 2 characters')
  })

  it('adds a second feature on its own route', async () => {
    const app = await freshApp()
    await run(['add', 'feature', 'tasks', '--page', '/'], app)
    const notes = await json('add', ['add', 'feature', 'notes', '--page', '/notes'], app)
    expect(notes.out.edited).toEqual(expect.arrayContaining(['routes.ts', 'hozu.config.ts', 'server.ts']))
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
    expect((await run(['post', '/', '--field', 'nope=1'], app)).code).toBe(2)
  })

  it('reads forms like a browser: defaults, selected options and submit buttons', () => {
    const html = `
      <form method="post" action="/?__hozu=a"><input name="title" value="x"><select name="kind"><option value="a">A</option><option value="b" selected>B</option></select><button type="submit">Add</button></form>
      <form method="post" action="/?__hozu=b"><input type="hidden" name="id" value="t1"><button>Mark done</button></form>
      <form method="post" action="/?__hozu=c"><button type="submit">Clear done</button><button type="button">Cancel</button></form>
      <form action="/search"><input name="q"></form>`
    expect(formsOf(html, '/')).toEqual([
      { action: '/?__hozu=a', fields: { title: 'x', kind: 'b' }, buttons: ['Add'] },
      { action: '/?__hozu=b', fields: { id: 't1' }, buttons: ['Mark done'] },
      { action: '/?__hozu=c', fields: {}, buttons: ['Clear done'] },
    ])
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

  it('runs the full scaffold like a user: toggle, detail, remove and a 404', async () => {
    const app = await freshApp()
    await run(['add', 'feature', 'tasks', '--page', '/', '--with', 'detail,toggle,filter,remove'], app)
    const flow = await json(
      'request',
      [
        'post',
        '/',
        '--field',
        'title=Ship it',
        '--next',
        'POST / id=t1@Mark done',
        '--next',
        '/tasks/t1',
        '--next',
        'POST / id=t1@Delete',
        '--next',
        '/tasks/t1',
      ],
      app,
    )
    const steps = flow.out.steps as { method: string; path: string; status: number; text: string | null }[]
    expect(steps.find((s) => s.method === 'GET' && s.path === '/tasks/t1')?.text).toContain('Status: done')
    expect(steps.at(-1)).toMatchObject({ path: '/tasks/t1', status: 404 })
    expect(steps.at(-1)?.text).toContain('Not found')
  })

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
    const page = await json(
      'request',
      [
        'post',
        '/',
        '--field',
        'title=Ship it',
        '--select',
        'button[aria-pressed=true]',
        '--select',
        'a',
        '--forms',
      ],
      app,
    )
    const last = page.out.steps.at(-1)
    expect(last.elements[0]).toMatchObject({ tag: 'button', attrs: { 'aria-pressed': 'true' }, text: 'All' })
    expect(last.elements[1]).toMatchObject({ tag: 'a', attrs: { href: '/tasks/t1' }, text: 'Ship it' })
    expect(last.forms.map((f: { buttons: string[] }) => f.buttons[0])).toEqual(['Add', 'Mark done', 'Delete'])
    expect(last.forms[1].fields).toEqual({ id: 't1' })
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
    expect(added.out.edited).toEqual(
      expect.arrayContaining(['serve.ts', 'server.ts', 'routes.ts', 'hozu.config.ts']),
    )
    expect(added.out.manual).toEqual([])
    const check = await json('check', ['check'], app)
    expect(check.out.types.errors).toEqual([])
    expect(check.out.validate.summary).toEqual({ errors: 0, warnings: 0 })
    expect(readFileSync(join(app, 'serve.ts'), 'utf8')).toContain('sessionCookie({')
    const signedOut = await json('request', ['get', '/'], app)
    expect(signedOut.out.steps[0]).toMatchObject({ status: 303, location: '/login' })
    const flow = await json(
      'request',
      [
        'post',
        '/login',
        '--field',
        'name=ada',
        '--next',
        'POST / title=Milk',
        '--next',
        'POST / @Sign out',
        '--next',
        'POST /login name=bob',
        '--next',
        '/',
        '--next',
        '/notes/n1',
      ],
      app,
    )
    const steps = flow.out.steps as { method: string; path: string; status: number; text: string | null }[]
    expect(steps.some((s) => s.text?.includes('Signed in as ada') && s.text.includes('Milk'))).toBe(true)
    expect(steps.at(-1)).toMatchObject({ path: '/notes/n1', status: 404 })
    const second = await json('add', ['add', 'feature', 'tasks', '--page', '/tasks', '--with', 'auth'], app)
    expect(second.out.created.some((f: string) => f.startsWith('features/account/'))).toBe(false)
    expect((await run(['check'], app)).code).toBe(0)
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

describe('references used as values (ADR 0037 D1)', () => {
  it('check explains a === on a reference, and warns on truthiness with HZ044 at the source line', async () => {
    const app = await freshApp()
    await run(['add', 'feature', 'tasks', '--page', '/'], app)
    const views = join(app, 'features/tasks/views.ts')
    const text = readFileSync(views, 'utf8')
    const heading = "ui.h1({ class: 'text-3xl font-bold' }, ['Tasks']),"
    expect(text).toContain(heading)
    writeFileSync(
      views,
      text.replace(
        heading,
        `${heading}\n      ui.p({}, [ctx.error ? 'Failed' : 'Fine']),\n      ui.p({}, [ctx.draft === 'x' ? 'x' : 'y']),`,
      ),
    )
    const line =
      readFileSync(views, 'utf8')
        .split('\n')
        .findIndex((l) => l.includes("ctx.error ? 'Failed'")) + 1
    const check = await json('check', ['check'], app)
    const ts = check.out.types.errors.find((e: { code: string }) => e.code === 'TS2367')
    expect(ts.hint).toContain('op.eq')
    const hz = check.out.validate.diagnostics.find((d: { code: string }) => d.code === 'HZ044')
    expect(hz).toMatchObject({
      severity: 'warning',
      message: 'ctx.error is a recorded reference used as a ?: condition',
      location: { source: { file: 'features/tasks/views.ts', line } },
    })
    expect(hz.fix.summary).toContain('ui.if(op.neq(ctx.error, null)')
  })
})

const checkFresh = async (app: string) => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [`${root}packages/cli/bin/hozu.js`, 'check', '--json'],
    { cwd: app },
  ).catch((e: { stdout: string }) => e)
  return JSON.parse(stdout)
}

describe('hozu add widget (ADR 0037 D5)', () => {
  it('declares, registers, bundles and depends on the widget, so check is clean and the page renders its host', async () => {
    const app = await freshApp()
    await run(['add', 'feature', 'tasks', '--page', '/'], app)
    const before = await json('check', ['check'], app)
    expect(before.out.validate.summary).toEqual({ errors: 0, warnings: 0 })
    const added = await json('add', ['add', 'widget', 'tasks', 'Chart'], app)
    expect(added.out.created).toEqual(['features/tasks/widgets.ts', 'features/tasks/chart.client.ts'])
    expect(added.out.edited).toEqual(['features/tasks/views.ts', 'serve.ts', 'package.json'])
    expect(readFileSync(join(app, 'serve.ts'), 'utf8')).toContain('widgets: await bundleWidgets(build),')
    const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@hozu/bundle']).toBe(pkg.dependencies['@hozu/core'])
    const views = join(app, 'features/tasks/views.ts')
    const heading = "ui.h1({ class: 'text-3xl font-bold' }, ['Tasks']),"
    writeFileSync(
      views,
      readFileSync(views, 'utf8').replace(
        heading,
        `${heading}\n      ui.use(Chart, { props: {}, on: {}, class: 'h-64 w-full' }, []),`,
      ),
    )
    const check = await checkFresh(app)
    expect(check.types.errors).toEqual([])
    expect(check.validate.summary).toEqual({ errors: 0, warnings: 0 })
    const serve = join(app, 'serve.ts')
    writeFileSync(serve, readFileSync(serve, 'utf8').replace('widgets: await bundleWidgets(build),', ''))
    const missing = await checkFresh(app)
    expect(missing.validate.diagnostics.map((d: { code: string }) => d.code)).toEqual(['HZ045'])
    expect(missing.validate.diagnostics[0].message).toContain('tasks.Chart')
  }, 60_000)
})
