import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from 'create-hozu'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { main } from '../src/main.ts'

vi.setConfig({ testTimeout: 60_000 })

const root = fileURLToPath(new URL('../../../', import.meta.url))
const fixture = `${root}packages/cli/test/fixtures/hozu-ui-kit`
const skillSource = `${root}.claude/skills/hozu`
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

async function appWith(options: { kit: boolean; ui?: boolean }) {
  const dir = join(root, '.tmp', `official-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await createApp(dir, {
    name: 'official',
    agent: 'claude',
    version: '0.2.0',
    runner: 'npx',
    skillSource,
    ...(options.ui ? { ui: fixture } : {}),
  })
  created.push(dir)
  if (options.kit) {
    mkdirSync(join(dir, 'node_modules/@hozu'), { recursive: true })
    symlinkSync(fixture, join(dir, 'node_modules/@hozu/ui-kit'))
  }
  return dir
}

describe('Hozu UI from the official kit (ADR 0089)', () => {
  it('asks for the package before installing', async () => {
    const app = await appWith({ kit: false })
    const { code, stdout } = await run(['add', 'kit', 'ui', '--from', 'official', '--json'], app)
    expect(code).toBe(2)
    expect(JSON.parse(stdout).error.suggestions).toEqual(['npm install -D @hozu/ui-kit'])
  })

  it('copies the kit with its lock, keeps the palette the scaffold uses, and checks clean', async () => {
    const app = await appWith({ kit: true })
    const added = await run(['add', 'kit', 'ui', '--from', 'official'], app)
    expect(added.code).toBe(0)
    expect(added.stdout).toContain('created   ui/button.ts')
    expect(added.stdout).toMatch(/todo {6}1 of the app's classes use Tailwind's own palette/)
    const lock = JSON.parse(readFileSync(join(app, 'ui/kit.lock.json'), 'utf8'))
    expect(lock).toMatchObject({ source: '@hozu/ui-kit', partial: true })
    expect(Object.keys(lock.files)).toContain('theme.css')
    expect(readFileSync(join(app, 'ui/theme.css'), 'utf8')).not.toContain(': initial;')
    expect(readFileSync(join(app, 'ui/kit.ts'), 'utf8')).toContain("id: 'ui'")
    expect(readFileSync(join(app, 'hozu.config.ts'), 'utf8')).toContain('kits: [uiKit]')
    expect((await run(['check', '--no-types'], app)).stdout).toContain('0 errors, 0 warnings')
    expect((await run(['docs', 'ui'], app)).stdout).toContain('# Hozu UI: the official components')
  })

  it('--sync updates a file the app kept as installed and lists one the app changed', async () => {
    const app = await appWith({ kit: true })
    await run(['add', 'kit', 'ui', '--from', 'official'], app)
    const local = join(app, 'node_modules/@hozu/ui-kit')
    unlinkSync(local)
    mkdirSync(local, { recursive: true })
    for (const f of ['package.json', 'catalog.json'])
      writeFileSync(join(local, f), readFileSync(join(fixture, f)))
    mkdirSync(join(local, 'kit/icons'), { recursive: true })
    for (const f of Object.keys(JSON.parse(readFileSync(join(app, 'ui/kit.lock.json'), 'utf8')).files))
      writeFileSync(join(local, 'kit', f), readFileSync(join(fixture, 'kit', f)))
    writeFileSync(join(local, 'kit/kit.ts'), readFileSync(join(fixture, 'kit/kit.ts')))
    appendFileSync(join(local, 'kit/card.ts'), '\nexport const cardVersion = 2\n')
    appendFileSync(join(local, 'kit/badge.ts'), '\nexport const badgeVersion = 2\n')
    appendFileSync(join(app, 'ui/badge.ts'), '\nexport const mine = true\n')
    const synced = await run(['add', 'kit', 'ui', '--sync'], app)
    expect(synced.stdout).toContain('edited    ui/card.ts')
    expect(synced.stdout).toMatch(/todo {6}ui\/badge\.ts was changed in this app/)
    expect(readFileSync(join(app, 'ui/card.ts'), 'utf8')).toContain('cardVersion = 2')
    expect(readFileSync(join(app, 'ui/badge.ts'), 'utf8')).toContain('mine = true')
  })

  it('adds one component and the files it uses, and registers it in kit.ts', async () => {
    const app = await appWith({ kit: true })
    await run(['add', 'kit', 'ui', '--from', 'official'], app)
    const kit = join(app, 'ui/kit.ts')
    writeFileSync(
      kit,
      readFileSync(kit, 'utf8').replace("import * as table from './table.ts'\n", '').replace(', table,', ','),
    )
    rmSync(join(app, 'ui/table.ts'))
    const added = await run(['add', 'component', 'ui', 'Table', '--from', 'official'], app)
    expect(added.stdout).toContain('created   ui/table.ts')
    expect(readFileSync(kit, 'utf8')).toContain("import * as table from './table.ts'")
    expect((await run(['check', '--no-types'], app)).stdout).toContain('0 errors, 0 warnings')
    const missing = await run(['add', 'component', 'ui', 'Carousel', '--from', 'official', '--json'], app)
    expect(JSON.parse(missing.stdout).error.message).toMatch(/has no component Carousel/)
  })

  it('create-hozu with ui copies the kit, writes the strict theme and a home page that uses it, and checks clean', async () => {
    const app = await appWith({ kit: true, ui: true })
    expect(existsSync(join(app, 'ui/tv.ts'))).toBe(true)
    expect(readFileSync(join(app, 'ui/theme.css'), 'utf8')).toContain('--color-*: initial;')
    const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@hozu/variants']).toBe('^0.2.0')
    expect(pkg.devDependencies['@hozu/ui-kit']).toMatch(/^\^\d/)
    expect(readFileSync(join(app, 'features/site/views.ts'), 'utf8')).toContain('ui.use(PageHeader')
    expect((await run(['check', '--no-types'], app)).stdout).toContain('0 errors, 0 warnings')
  })
})
