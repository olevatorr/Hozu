import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Ajv } from 'ajv'
import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 30_000 })

const root = fileURLToPath(new URL('../../../', import.meta.url))
const notes = join(root, 'examples', 'notes')
const bin = `${root}packages/cli/bin/hozu.js`
const schema = JSON.parse(readFileSync(`${root}packages/cli/schema/why.schema.json`, 'utf8'))

async function run(args: string[]) {
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [bin, ...args], { cwd: notes })
    return { code: 0, stdout, stderr }
  } catch (e) {
    const failed = e as { code: number; stdout: string; stderr: string }
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr }
  }
}

describe('hozu why on a view node or page (ADR 0047, ADR 0053 F)', () => {
  it('resolves a DevTools id to the authored line under the real CLI, not a transformed one', async () => {
    const { code, stdout } = await run(['why', 'account.Login/2/1', '--json'])
    expect(code).toBe(0)
    const out = JSON.parse(stdout)
    expect(new Ajv({ strict: false }).validate(schema, out)).toBe(true)
    expect(out.node).toMatchObject({
      kind: 'element',
      tag: 'button',
      location: { file: 'features/account/views.ts', line: 38 },
      component: { ref: 'ui.Button', declaration: { file: 'ui/button.ts' } },
    })
    const line = readFileSync(join(notes, 'features/account/views.ts'), 'utf8').split('\n')[37]
    expect(out.node.excerpt.lines).toContain(line)
  })

  it('names a translated text by its message key and base-locale string', async () => {
    const out = JSON.parse((await run(['why', 'account.Login/2/1', '--json'])).stdout).node
    expect(out.children[0].text).toBe('"Sign in" · message account.signIn')
    expect(out.children[0].source).toEqual({
      kind: 'message',
      detail: 'account.signIn',
      location: { file: 'features/account/model.ts', line: 107, column: expect.any(Number) },
      uses: 2,
    })
  })

  it('says where bound text comes from: the query field, the list item, the machine context', async () => {
    const source = async (id: string) => JSON.parse((await run(['why', id, '--json'])).stdout).node.source
    const query = (line: number) => ({ file: 'features/account/model.ts', line, column: expect.any(Number) })
    expect(await source('account.AccountBar/0/ready/1')).toEqual({
      kind: 'data',
      detail: 'account.me.name',
      location: query(13),
      uses: null,
    })
    expect(await source('account.Admin/1/ready/0/item/0')).toEqual({
      kind: 'data',
      detail: 'account.accounts[].name',
      location: query(24),
      uses: null,
    })
    expect(await source('account.Login/3/ifTrue/0/0')).toEqual({
      kind: 'context',
      detail: 'ctx.error',
      location: null,
      uses: null,
    })
  })

  it('names the transition an event takes, at its line in the model', async () => {
    const out = JSON.parse((await run(['why', 'account.Login/2', '--json'])).stdout).node
    expect(out.events).toEqual([
      {
        dom: 'submit',
        event: 'account.SignIn',
        transitions: [
          {
            from: 'idle',
            to: 'signingIn',
            guarded: false,
            navigates: false,
            location: { file: 'features/account/model.ts', line: 53, column: expect.any(Number) },
          },
        ],
      },
    ])
  })

  it('counts the places a change would reach: every use of the component, every text using the message', async () => {
    const button = JSON.parse((await run(['why', 'account.Login/2/1', '--json'])).stdout).node
    expect(button.component.uses).toBe(6)
    expect(button.children[0].source.uses).toBe(2)
    const heading = JSON.parse((await run(['why', 'account.Login/1', '--json'])).stdout).node
    expect(heading.children[0].source.uses).toBe(2)
    expect(heading.component).toBeNull()
  })

  it('locates a page: its declaration, route, views and head fields', async () => {
    const out = JSON.parse((await run(['why', 'page:home', '--json'])).stdout).node
    expect(out).toMatchObject({
      id: 'page:home',
      kind: 'page',
      location: { file: 'hozu.config.ts', line: 20 },
      page: {
        route: 'home',
        path: '/',
        routeLocation: { file: 'routes.ts', line: 3 },
        views: ['account.AccountBar', 'notes.NotesBoard'],
        head: { title: 'Notes', description: null, noindex: true, query: 'account.me' },
      },
    })
  })

  it('accepts the IR pointer, which outlives line numbers', async () => {
    const byId = JSON.parse((await run(['why', 'account.Login/1', '--json'])).stdout).node
    const byPointer = JSON.parse((await run(['why', byId.pointer, '--json'])).stdout).node
    expect(byPointer.location).toEqual(byId.location)
  })

  it('explains an unknown id', async () => {
    const { code, stderr } = await run(['why', 'nope.Nothing/9'])
    expect(code).toBe(2)
    expect(stderr).toContain('No view node nope.Nothing/9')
  })

  it('a file:line that two files share is ambiguous and lists both paths', async () => {
    const { code, stderr } = await run(['why', 'views.ts:54'])
    expect(code).toBe(2)
    expect(stderr).toContain('views.ts:54 names view nodes in 2 files')
    expect(stderr).toContain('features/account/views.ts:54')
    expect(stderr).toContain('features/notes/views.ts:54')
  })

  it('hozu show takes file:line and --in "<text>", and marks a note whose id now names something else (0.15 dogfood)', async () => {
    const store = join(notes, '.hozu/notes.json')
    rmSync(store, { force: true })
    try {
      const line =
        readFileSync(join(notes, 'features/notes/views.ts'), 'utf8')
          .split('\n')
          .findIndex((l) => l.includes('ui.form({ on: { submit')) + 1
      const added = JSON.parse(
        (
          await run([
            'show',
            `features/notes/views.ts:${line}`,
            '--in',
            'Buy milk',
            '--note',
            'Pin moved',
            '--json',
          ])
        ).stdout,
      )
      expect(added.added).toMatchObject({
        label: '<form> in notes.NotesBoard',
        within: 'Buy milk',
        at: `features/notes/views.ts:${line}`,
      })
      const saved = JSON.parse(readFileSync(store, 'utf8'))
      saved.notes[0].label = '<button> in notes.NotesBoard'
      writeFileSync(store, JSON.stringify(saved))
      const listed = JSON.parse((await run(['show', '--json'])).stdout)
      expect(listed.notes[0].stale).toBe('this id now names <form> in notes.NotesBoard')
    } finally {
      rmSync(store, { force: true })
    }
  })

  it('hozu show still lists the notes when the project does not load, without marking them stale', async () => {
    const dir = join(root, '.tmp', `show-broken-${Date.now()}`)
    mkdirSync(join(dir, '.hozu'), { recursive: true })
    writeFileSync(join(dir, 'hozu.config.ts'), 'export default (\n')
    const note = {
      n: 1,
      id: 'notes.NotesBoard/1',
      label: '<h1> in notes.NotesBoard',
      at: null,
      path: '/',
      within: null,
      text: 'Bigger title',
      created: '2026-10-04T00:00:00.000Z',
    }
    writeFileSync(join(dir, '.hozu/notes.json'), JSON.stringify({ next: 2, notes: [note] }))
    try {
      const { stdout } = await promisify(execFile)(process.execPath, [bin, 'show', '--json'], { cwd: dir })
      expect(JSON.parse(stdout).notes).toEqual([note])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
