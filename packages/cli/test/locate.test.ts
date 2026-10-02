import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Ajv } from 'ajv'
import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 30_000 })

const root = fileURLToPath(new URL('../../../', import.meta.url))
const notes = join(root, 'examples', 'notes')
const bin = `${root}packages/cli/bin/hozu.js`
const schema = JSON.parse(readFileSync(`${root}packages/cli/schema/locate.schema.json`, 'utf8'))

async function run(args: string[]) {
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [bin, ...args], { cwd: notes })
    return { code: 0, stdout, stderr }
  } catch (e) {
    const failed = e as { code: number; stdout: string; stderr: string }
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr }
  }
}

describe('hozu locate (ADR 0047)', () => {
  it('resolves a DevTools id to the authored line under the real CLI, not a transformed one', async () => {
    const { code, stdout } = await run(['locate', 'account.Login/2/1', '--json'])
    expect(code).toBe(0)
    const out = JSON.parse(stdout)
    expect(new Ajv({ strict: false }).validate(schema, out)).toBe(true)
    expect(out).toMatchObject({
      kind: 'element',
      tag: 'button',
      location: { file: 'features/account/views.ts', line: 38 },
      component: { ref: 'ui.Button', declaration: { file: 'ui/button.ts' } },
    })
    const line = readFileSync(join(notes, 'features/account/views.ts'), 'utf8').split('\n')[37]
    expect(out.excerpt.lines).toContain(line)
  })

  it('names a translated text by its message key and base-locale string', async () => {
    const out = JSON.parse((await run(['locate', 'account.Login/2/1', '--json'])).stdout)
    expect(out.children[0].text).toBe('"Sign in" · message account.signIn')
    expect(out.children[0].source).toEqual({
      kind: 'message',
      detail: 'account.signIn',
      location: { file: 'features/account/model.ts', line: 99, column: expect.any(Number) },
      uses: 2,
    })
  })

  it('says where bound text comes from: the query field, the list item, the machine context', async () => {
    const source = async (id: string) => JSON.parse((await run(['locate', id, '--json'])).stdout).source
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
      location: query(23),
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
    const out = JSON.parse((await run(['locate', 'account.Login/2', '--json'])).stdout)
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
            location: { file: 'features/account/model.ts', line: 45, column: expect.any(Number) },
          },
        ],
      },
    ])
  })

  it('counts the places a change would reach: every use of the component, every text using the message', async () => {
    const button = JSON.parse((await run(['locate', 'account.Login/2/1', '--json'])).stdout)
    expect(button.component.uses).toBe(6)
    expect(button.children[0].source.uses).toBe(2)
    const heading = JSON.parse((await run(['locate', 'account.Login/1', '--json'])).stdout)
    expect(heading.children[0].source.uses).toBe(2)
    expect(heading.component).toBeNull()
  })

  it('locates a page: its declaration, route, views and head fields', async () => {
    const out = JSON.parse((await run(['locate', 'page:home', '--json'])).stdout)
    expect(out).toMatchObject({
      id: 'page:home',
      kind: 'page',
      location: { file: 'hozu.config.ts', line: 19 },
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
    const byId = JSON.parse((await run(['locate', 'account.Login/1', '--json'])).stdout)
    const byPointer = JSON.parse((await run(['locate', byId.pointer, '--json'])).stdout)
    expect(byPointer.location).toEqual(byId.location)
  })

  it('explains an unknown id', async () => {
    const { code, stderr } = await run(['locate', 'nope.Nothing/9'])
    expect(code).toBe(2)
    expect(stderr).toContain('No view node nope.Nothing/9')
  })
})
