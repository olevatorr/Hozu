import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
})
