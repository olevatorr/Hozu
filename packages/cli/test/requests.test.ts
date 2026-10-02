import { cpSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveRequest } from '@hozu/devtools'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const schema = JSON.parse(readFileSync(`${root}packages/cli/schema/requests.schema.json`, 'utf8'))

async function run(args: string[], cwd: string) {
  let stdout = ''
  const code = await main(args, cwd, (s) => {
    stdout += s
  })
  return { code, stdout }
}

const request = (title: string) =>
  `# Hozu request: ${title}\n\n## 1. <h1>\n- Want: x\n- Where: \`features/notes/views.ts:61:14\` (view \`notes.NotesBoard\`)\n`

describe('hozu requests (ADR 0047 D2)', () => {
  it('lists open requests and closes one with its result, which removes it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-requests-'))
    cpSync(join(root, 'examples/notes/hozu.config.ts'), join(dir, 'hozu.config.ts'))
    saveRequest(dir, request('Bigger title'), new Date('2026-10-02T10:00:00Z'))
    saveRequest(dir, request('Red delete button'), new Date('2026-10-02T10:05:00Z'))

    const listed = await run(['requests'], dir)
    expect(listed.code).toBe(0)
    expect(listed.stdout).toContain('0001  open  Bigger title  features/notes/views.ts:61')
    expect(listed.stdout).toContain('2 open')

    const done = await run(['requests', 'done', '0001', '--result', 'h1 is text-4xl'], dir)
    expect(done.code).toBe(0)
    expect(done.stdout).toContain('0001 done and removed: h1 is text-4xl')

    const json = JSON.parse((await run(['requests', '--json'], dir)).stdout)
    expect(new Ajv({ strict: false }).validate(schema, json)).toBe(true)
    expect(json.requests.map((r: { number: string }) => r.number)).toEqual(['0002'])
    const closing = JSON.parse(
      (await run(['requests', 'done', '2', '--result', 'red', '--json'], dir)).stdout,
    )
    expect(closing.done).toEqual({ number: '0002', result: 'red' })
    expect(closing.requests).toEqual([])
  })

  it('done needs a number and a result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-requests-'))
    expect((await run(['requests', 'done', '0001'], dir)).code).toBe(2)
    expect((await run(['requests', 'done', '0007', '--result', 'x'], dir)).code).toBe(2)
  })

  it('an app without requests explains how to make one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-requests-'))
    const { code, stdout } = await run(['requests'], dir)
    expect(code).toBe(0)
    expect(stdout).toContain('No requests yet')
    expect(stdout).toContain('hozu dev')
  })
})
