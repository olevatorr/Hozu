import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from 'create-hozu'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { main } from '../src/main.ts'

vi.setConfig({ testTimeout: 60_000 })

const root = fileURLToPath(new URL('../../../', import.meta.url))
const created: string[] = []
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

async function run(args: string[], cwd: string) {
  let stdout = ''
  const code = await main(args, cwd, (s) => {
    stdout += s
  })
  return { code, stdout }
}

const codesOf = (stdout: string) =>
  (JSON.parse(stdout).validate.diagnostics as { code: string }[]).map((d) => d.code)

describe('hozu add kit (ADR 0045 D, I)', () => {
  it('writes the kit, the generated tv.ts and the kits entry; HZ078 when the design system moves; --sync fixes it', async () => {
    const dir = join(root, '.tmp', `kit-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(root, '.tmp'), { recursive: true })
    await createApp(dir, {
      name: 'kit',
      agent: 'claude',
      version: '0.2.0',
      runner: 'npx',
      skillSource: `${root}.claude/skills/hozu`,
    })
    created.push(dir)
    const added = await run(['add', 'kit', 'ui', '--json'], dir)
    expect(added.code).toBe(0)
    expect(JSON.parse(added.stdout)).toMatchObject({
      created: ['ui/tv.ts', 'ui/kit.ts'],
      edited: ['hozu.config.ts', 'package.json'],
      manual: [],
    })
    expect(readFileSync(join(dir, 'ui/tv.ts'), 'utf8')).toContain('// hozu:variants-config ui\n')
    const config = readFileSync(join(dir, 'hozu.config.ts'), 'utf8')
    expect(config).toContain("import { kit as uiKit } from './ui/kit.ts'")
    expect(config).toMatch(/kits: \[uiKit\],\n\s*features:/)
    expect(
      JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies['@hozu/variants'],
    ).toBeTruthy()
    expect((await run(['add', 'kit', 'ui'], dir)).code).toBe(2)
    const clean = await run(['check', '--json'], dir)
    expect(codesOf(clean.stdout)).toEqual([])
    appendFileSync(join(dir, 'app.css'), '\n@theme {\n  --text-hero: 3rem;\n}\n')
    const stale = await run(['check', '--json'], dir)
    expect(stale.code).toBe(1)
    expect(codesOf(stale.stdout)).toEqual(['HZ078'])
    const synced = await run(['add', 'kit', 'ui', '--sync', '--json'], dir)
    expect(JSON.parse(synced.stdout).edited).toEqual(['ui/tv.ts'])
    expect(readFileSync(join(dir, 'ui/tv.ts'), 'utf8')).toContain("text: ['hero']")
    expect(codesOf((await run(['check', '--json'], dir)).stdout)).toEqual([])
    expect(existsSync(join(dir, 'ui/kit.ts'))).toBe(true)
  })

  it('hozu check prints one line per component with overrides', async () => {
    const { code, stdout } = await run(['check'], join(root, 'examples/notes'))
    expect(code).toBe(0)
    expect(stdout).toContain('ui.Button: 1 override — account\n')
  })
})
