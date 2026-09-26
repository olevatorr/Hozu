import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Agent = 'claude' | 'agents' | 'both'
export type Runner = 'pnpm exec' | 'npx' | 'yarn' | 'bunx'

export const AGENTS: readonly Agent[] = ['claude', 'agents', 'both']

const root = fileURLToPath(new URL('../', import.meta.url))
export const defaultSkill = join(root, 'skill')
const templates = join(root, 'templates')

const targets = (agent: Agent) =>
  [
    {
      guide: 'CLAUDE.md',
      skill: '.claude/skills/hozu',
      read: 'Use the `hozu` skill (`__SKILL__/SKILL.md`).',
    },
    {
      guide: 'AGENTS.md',
      skill: '.agents/skills/hozu',
      read: 'Read `__SKILL__/SKILL.md` before writing or changing any Hozu code.',
    },
  ].filter((_, i) => agent === 'both' || (agent === 'claude' ? i === 0 : i === 1))

export const runnerOf = (userAgent: string | undefined): Runner => {
  const name = userAgent?.split('/')[0]
  return name === 'npm' ? 'npx' : name === 'yarn' ? 'yarn' : name === 'bun' ? 'bunx' : 'pnpm exec'
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

const fill = (text: string, values: Record<string, string>) =>
  Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`__${key}__`, value), text)

export interface AgentOptions {
  name: string
  runner: Runner
  skillSource?: string
}

export async function writeAgentFiles(dir: string, agent: Agent, options: AgentOptions): Promise<string[]> {
  const written: string[] = []
  const guide = await readFile(join(templates, 'guide.md'), 'utf8')
  for (const t of targets(agent)) {
    const skill = join(dir, t.skill)
    await rm(skill, { recursive: true, force: true })
    await mkdir(dirname(skill), { recursive: true })
    await cp(options.skillSource ?? defaultSkill, skill, { recursive: true })
    written.push(t.skill)
    const file = join(dir, t.guide)
    if (await exists(file)) continue
    const values = {
      NAME: options.name,
      RUN: options.runner,
      SKILL: t.skill,
      NOTE:
        options.runner === 'pnpm exec'
          ? ''
          : `\nThe skill writes commands as \`pnpm exec …\`; in this app use \`${options.runner} …\`.\n`,
    }
    await writeFile(file, fill(fill(guide, { READ: t.read }), values))
    written.push(t.guide)
  }
  return written
}

async function files(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await files(path)))
    else out.push(path)
  }
  return out
}

export interface CreateOptions extends AgentOptions {
  agent: Agent
  version: string
}

export const packageJson = (name: string, version: string) => ({
  name,
  private: true,
  type: 'module',
  scripts: {
    check: 'hozu check',
    start: 'node serve.ts',
    build: 'hozu build',
  },
  dependencies: {
    '@hozu/adapter-node': `^${version}`,
    '@hozu/core': `^${version}`,
    '@hozu/css': `^${version}`,
    '@hozu/data': `^${version}`,
    '@hozu/runtime-server': `^${version}`,
    '@hozu/schema-zod': `^${version}`,
    zod: '^4.6.5',
  },
  devDependencies: {
    '@hozu/cli': `^${version}`,
    '@hozu/testing': `^${version}`,
    '@types/node': '^22.20.4',
    typescript: '^7.0.2',
  },
  engines: { node: '>=22.18' },
})

export async function createApp(dir: string, options: CreateOptions): Promise<string[]> {
  if ((await exists(dir)) && (await readdir(dir)).length)
    throw new Error(`${dir} is not empty. Choose a new directory name.`)
  const app = join(templates, 'app')
  const written: string[] = []
  for (const source of await files(app)) {
    const rel = relative(app, source)
    const target = join(dir, rel === 'gitignore' ? '.gitignore' : rel)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, fill(await readFile(source, 'utf8'), { NAME: options.name }))
    written.push(relative(dir, target))
  }
  await writeFile(
    join(dir, 'package.json'),
    `${JSON.stringify(packageJson(options.name, options.version), null, 2)}\n`,
  )
  written.push('package.json')
  written.push(...(await writeAgentFiles(dir, options.agent, options)))
  return written
}
