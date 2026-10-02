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
