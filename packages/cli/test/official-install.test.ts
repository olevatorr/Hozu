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
import { load } from '../src/load.ts'
import { main } from '../src/main.ts'
import { checkPreviews, devPreviews, loadPreviews, renderExample } from '../src/previews.ts'

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
    expect(added.stdout).toMatch(/todo {6}\d+ of the app's classes use Tailwind's own palette/)
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

describe("the kit's examples (p.example in ui/previews.ts)", () => {
  it('create-hozu with ui names the examples in project({ previews }), and each example renders as written', async () => {
    const app = await appWith({ kit: true, ui: true })
    expect(readFileSync(join(app, 'hozu.config.ts'), 'utf8')).toContain(
      "  previews: [new URL('./ui/previews.ts', import.meta.url)],\n",
    )
    const loaded = await load(undefined, app)
    const build = loaded.build(true)
    const { set, problems } = await loadPreviews(loaded)
    expect(problems).toEqual([])
    expect(checkPreviews(loaded, build, set)).toEqual([])
    const examples = devPreviews(loaded, build, set).examples ?? {}
    expect(examples['ui.Table']).toEqual([
      { name: 'Orders', file: 'ui/previews.ts', line: expect.any(Number) },
    ])
    expect(Object.keys(examples)).toEqual(
      expect.arrayContaining(['ui.DropdownMenu', 'ui.NavBar', 'ui.Dialog', 'ui.Field', 'ui.Icon']),
    )
    const table = await renderExample(loaded, set, 'ui.Table', 'Orders')
    expect(table.problems).toEqual([])
    expect(table.html).toMatch(/^<div[^>]*><table/)
    expect(table.html.match(/<tr/g)).toHaveLength(4)
    expect(table.html).toContain('Refunded')
    for (const [id, list] of Object.entries(examples))
      for (const e of list)
        expect((await renderExample(loaded, set, id, e.name)).ok, `${id} ${e.name}`).toBe(true)
    expect((await renderExample(loaded, set, 'ui.Table', 'Nope')).problems).toEqual([
      'No example "Nope" of ui.Table',
    ])
  })

  it("hozu add kit ui --from official adds the examples to project({ previews }), as a list beside the app's own", async () => {
    const app = await appWith({ kit: true })
    const added = await run(['add', 'kit', 'ui', '--from', 'official'], app)
    expect(added.stdout).toContain('created   ui/previews.ts')
    expect(readFileSync(join(app, 'hozu.config.ts'), 'utf8')).toContain(
      "previews: [new URL('./ui/previews.ts', import.meta.url)],\n  features:",
    )
    const { withPreviews } = await import('../src/commands/official.ts')
    const url = "new URL('./ui/previews.ts', import.meta.url)"
    const own = "previews: new URL('./previews.ts', import.meta.url),"
    expect(withPreviews(`project({\n  ${own}\n})`, url)).toBe(
      `project({\n  previews: [new URL('./previews.ts', import.meta.url), ${url}],\n})`,
    )
    expect(withPreviews('project({ previews: [a], features: [] })', url)).toBe(
      `project({ previews: [a, ${url}], features: [] })`,
    )
    expect(withPreviews('project({ previews, features: [] })', url)).toBeNull()
  })
})

describe('kit.ts edits and package changes (review of ADR 0089)', () => {
  it('adds a module to a formatted kit.ts with a trailing comma and multi-line imports', async () => {
    const { withModule } = await import('../src/commands/official.ts')
    const source = `import { ui } from '@hozu/core'\nimport {\n  thing,\n} from './x.ts'\n\nexport const kit = ui.kit({\n  id: 'ui',\n  components: [\n    button,\n    badge,\n  ],\n})\n`
    const next = withModule(source, 'table.ts')!
    expect(next).toContain("} from './x.ts'\nimport * as table from './table.ts'\n")
    expect(next).toMatch(/components: \[button,\s+badge, table\]/)
    expect(next).not.toContain(',,')
  })

  it('--sync copies a file a newer component uses and names a file the package dropped', async () => {
    const app = await appWith({ kit: true })
    await run(['add', 'kit', 'ui', '--from', 'official'], app)
    const local = join(app, 'node_modules/@hozu/ui-kit')
    unlinkSync(local)
    mkdirSync(join(local, 'kit/icons'), { recursive: true })
    const lock = JSON.parse(readFileSync(join(app, 'ui/kit.lock.json'), 'utf8'))
    for (const f of [...Object.keys(lock.files), 'kit.ts'])
      if (f !== 'metric.ts') writeFileSync(join(local, 'kit', f), readFileSync(join(fixture, 'kit', f)))
    writeFileSync(join(local, 'kit/spark.ts'), "export const spark = 'M0 0'\n")
    const catalog = JSON.parse(readFileSync(join(fixture, 'catalog.json'), 'utf8'))
    delete catalog.files['metric.ts']
    catalog.files['spark.ts'] = { components: [], uses: [] }
    catalog.files['card.ts'].uses = ['spark.ts']
    writeFileSync(join(local, 'catalog.json'), JSON.stringify(catalog))
    writeFileSync(join(local, 'package.json'), JSON.stringify({ name: '@hozu/ui-kit', version: '0.2.0' }))
    appendFileSync(join(local, 'kit/card.ts'), "\nexport { spark } from './spark.ts'\n")
    const synced = await run(['add', 'kit', 'ui', '--sync'], app)
    expect(synced.stdout).toContain('created   ui/spark.ts')
    expect(synced.stdout).toContain('edited    ui/card.ts')
    expect(synced.stdout).toMatch(/todo {6}@hozu\/ui-kit@0\.2\.0 no longer has metric\.ts/)
    expect(existsSync(join(app, 'ui/metric.ts'))).toBe(true)
  })
})
