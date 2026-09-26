import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, runnerOf, writeAgentFiles } from 'create-hozu'
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
    expect(guide).toContain('npx hozu check')
    expect(guide).toContain('in this app use `npx …`')
    expect(await has(join(dir, '.agents/skills/hozu/reference.md'))).toBe(true)
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
    await writeAgentFiles(dir, 'claude', base)
    expect(await readFile(join(dir, 'CLAUDE.md'), 'utf8')).toBe('# mine\n')
    expect(await readFile(join(dir, '.claude/skills/hozu/SKILL.md'), 'utf8')).toContain(
      '# Hozu authoring guide',
    )
  })

  it('writes commands for the package manager that ran it', () => {
    expect(runnerOf('npm/10.8.2 node/v22.22.2')).toBe('npx')
    expect(runnerOf('pnpm/10.33.0')).toBe('pnpm exec')
    expect(runnerOf('bun/1.2.0')).toBe('bunx')
    expect(runnerOf(undefined)).toBe('pnpm exec')
  })
})
