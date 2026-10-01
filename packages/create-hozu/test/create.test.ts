import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BEGIN,
  createApp,
  END,
  guideBlock,
  migrateGuide,
  runnerOf,
  TARGETS,
  writeAgentFiles,
} from 'create-hozu'
import { describe, expect, it } from 'vitest'
import { sync } from '../../../scripts/skill.ts'

const skillSource = fileURLToPath(new URL('../../../.claude/skills/hozu', import.meta.url))
const fresh = () => mkdtemp(join(tmpdir(), 'create-hozu-'))
const has = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )
const base = { name: 'demo', version: '0.1.0', runner: 'pnpm exec' as const, skillSource }

const repo = (path: string) => readFile(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8')

describe('SKILL.md (ADR 0043 K)', () => {
  const skillFile = () => repo('.claude/skills/hozu/SKILL.md')

  it('fits 4 096 B with its frontmatter and holds the rules no diagnostic checks', async () => {
    const skill = await skillFile()
    expect(Buffer.byteLength(skill)).toBeLessThanOrEqual(4096)
    expect(skill.startsWith('---\nname: hozu\n')).toBe(true)
    for (const rule of [
      '## The change loop',
      'npx hozu map',
      'npx hozu check --update-lock',
      "--session '…' --js both",
      '## What to touch',
      '| A per-item action stored on the server',
      '**Query resolvers only read.**',
      'in one `browse` chain with `--js both`',
      '**Contracts only where a transition decides:**',
      "**`'live'` only for push**",
      '**`invalidates` drives the client refresh**',
    ])
      expect(skill).toContain(rule)
  })

  it('leaves what a diagnostic teaches to that diagnostic', async () => {
    const skill = await skillFile()
    for (const taught of [
      'formAll',
      'formRef',
      'head.failed',
      'part(',
      "'request'",
      "'static'",
      'ui.if',
      'op.',
    ])
      expect(skill).not.toContain(taught)
    expect(skill).not.toContain('changing.md')
    expect(skill).not.toContain('hozu post')
  })

  it('indexes exactly the topics hozu docs prints', async () => {
    const skill = await skillFile()
    const index = skill.slice(skill.indexOf('## Topics'))
    const rows = index.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Task'))
    const named = rows.flatMap((r) =>
      [
        ...r
          .split('|')
          .at(-2)!
          .matchAll(/`([a-z0-9]+)`/g),
      ].map((m) => m[1]),
    )
    const topics = (await readdir(join(skillSource, 'topics'))).map((f) => f.replace(/\.md$/, ''))
    expect([...new Set(named)].sort()).toEqual(topics.sort())
  })
})

describe('the 0.8 guide (ADR 0043 K)', () => {
  it('leaves the loop and the contract rule to SKILL.md', async () => {
    const guide = await repo('packages/create-hozu/templates/guide.md')
    expect(guide).not.toContain('## The loop')
    expect(guide).not.toMatch(/contract/i)
    expect(guide).not.toContain('changing.md')
    expect(guide).not.toContain('hozu post')
    expect(guide).not.toContain(BEGIN)
  })

  const target = TARGETS[0]

  it('writes the marked block, then replaces only the marked block', () => {
    const written = migrateGuide(null, target, '/apps/demo', 'npx')
    expect(written.kind).toBe('written')
    const code = (written as { code: string }).code
    expect(code.startsWith(`${BEGIN}\n# demo\n`)).toBe(true)
    expect(code).toContain('npx hozu browse')
    expect(code).not.toContain('The skill writes commands')
    const own = `# notes by the team\n\n${code}\n## Ours\n- keep this\n`
    expect(migrateGuide(own, target, '/apps/demo', 'npx')).toEqual({ kind: 'current', code: own })
    const stale = own.replace('Apply the fix', 'Apply every fix')
    const again = migrateGuide(stale, target, '/apps/demo', 'npx')
    expect(again).toEqual({ kind: 'replaced', code: own })
  })

  it('treats a guide without markers as custom, an unmarked 0.8 guide included', () => {
    const unmarked = guideBlock(target, 'demo', 'npx').replace(`${BEGIN}\n`, '').replace(`${END}\n`, '')
    expect(migrateGuide(unmarked, target, '/apps/demo', 'npx').kind).toBe('custom')
  })

  it('never rewrites a guide it does not know', () => {
    const result = migrateGuide('# mine\n\nOur rules.\n', target, '/apps/demo', 'pnpm exec')
    expect(result.kind).toBe('custom')
    expect((result as { block: string }).block).toContain(END)
  })
})

describe('create-hozu', () => {
  it('keeps the skill example and AGENTS.md generated from their sources', async () => {
    expect(await sync(false)).toEqual([])
  })

  it('creates an app for Claude Code', async () => {
    const dir = join(await fresh(), 'demo')
    const written = await createApp(dir, { ...base, agent: 'claude' })
    expect(written).toContain('CLAUDE.md')
    expect(written).not.toContain('AGENTS.md')
    expect(await has(join(dir, '.claude/skills/hozu/SKILL.md'))).toBe(true)
    expect(await has(join(dir, '.claude/skills/hozu/example/features/bookmarks/model.ts'))).toBe(true)
    expect(await has(join(dir, '.agents'))).toBe(false)
    const guide = await readFile(join(dir, 'CLAUDE.md'), 'utf8')
    expect(guide).toContain('Use the `hozu` skill (`.claude/skills/hozu/SKILL.md`)')
    expect(guide.startsWith(`${BEGIN}\n# demo\n`)).toBe(true)
    expect(guide.endsWith(`${END}\n`)).toBe(true)
    expect(guide).toContain('in this app use `pnpm exec …`')
    expect(guide).not.toMatch(/__[A-Z]+__/)
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@hozu/core']).toBe('^0.1.0')
    expect(await readFile(join(dir, 'hozu.config.ts'), 'utf8')).toContain("name: 'demo'")
    expect(await has(join(dir, '.gitignore'))).toBe(true)
  })

  it('creates an app for agents that read AGENTS.md, with npm commands', async () => {
    const dir = join(await fresh(), 'demo')
    await createApp(dir, { ...base, agent: 'agents', runner: 'npx' })
    const guide = await readFile(join(dir, 'AGENTS.md'), 'utf8')
    expect(guide).toContain('Read `.agents/skills/hozu/SKILL.md` before writing')
    expect(guide).toContain('npx hozu browse')
    expect(guide).not.toContain('The skill writes commands')
    expect(await has(join(dir, '.agents/skills/hozu/topics/views.md'))).toBe(true)
    expect(await has(join(dir, 'CLAUDE.md'))).toBe(false)
  })

  it('creates both sets and refuses a directory that is not empty', async () => {
    const dir = join(await fresh(), 'demo')
    const written = await createApp(dir, { ...base, agent: 'both' })
    expect(written).toEqual(expect.arrayContaining(['CLAUDE.md', 'AGENTS.md']))
    await expect(createApp(dir, { ...base, agent: 'claude' })).rejects.toThrow('not empty')
  })

  it('rewrites a stale skill but keeps an edited guide', async () => {
    const dir = join(await fresh(), 'demo')
    await createApp(dir, { ...base, agent: 'claude' })
    await writeFile(join(dir, 'CLAUDE.md'), '# mine\n')
    await writeFile(join(dir, '.claude/skills/hozu/SKILL.md'), 'old')
    const result = await writeAgentFiles(dir, 'claude', base)
    expect(result.written).toEqual(['.claude/skills/hozu'])
    expect(result.custom.map((c) => c.guide)).toEqual(['CLAUDE.md'])
    expect(await readFile(join(dir, 'CLAUDE.md'), 'utf8')).toBe('# mine\n')
    expect(await readFile(join(dir, '.claude/skills/hozu/SKILL.md'), 'utf8')).toContain('# Hozu\n')
  })

  it('writes commands for the package manager that ran it', () => {
    expect(runnerOf('npm/10.8.2 node/v22.22.2')).toBe('npx')
    expect(runnerOf('pnpm/10.33.0')).toBe('pnpm exec')
    expect(runnerOf('bun/1.2.0')).toBe('bunx')
    expect(runnerOf(undefined)).toBe('pnpm exec')
  })
})
