import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrateGuide, type Runner, TARGETS } from './guide.ts'

export type Agent = 'claude' | 'agents' | 'both'
export type { BlockResult, Runner, Target } from './guide.ts'
export { BEGIN, currentGuide, END, guideBlock, migrateGuide, RUNNERS, TARGETS } from './guide.ts'

export const AGENTS: readonly Agent[] = ['claude', 'agents', 'both']

const root = fileURLToPath(new URL('../', import.meta.url))
export const defaultSkill = join(root, 'skill')
const templates = join(root, 'templates')

const targets = (agent: Agent) =>
  TARGETS.filter((_, i) => agent === 'both' || (agent === 'claude' ? i === 0 : i === 1))

export const runnerOf = (userAgent: string | undefined): Runner => {
  const name = userAgent?.split('/')[0]
  return name === 'npm' ? 'npx' : name === 'yarn' ? 'yarn' : name === 'bun' ? 'bunx' : 'pnpm exec'
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

export interface AgentOptions {
  name: string
  runner: Runner
  skillSource?: string
}

export interface AgentFiles {
  written: string[]
  custom: { guide: string; block: string }[]
}

export async function writeAgentFiles(dir: string, agent: Agent, options: AgentOptions): Promise<AgentFiles> {
  const out: AgentFiles = { written: [], custom: [] }
  for (const t of targets(agent)) {
    const skill = join(dir, t.skill)
    await rm(skill, { recursive: true, force: true })
    await mkdir(dirname(skill), { recursive: true })
    await cp(options.skillSource ?? defaultSkill, skill, { recursive: true })
    out.written.push(t.skill)
    const file = join(dir, t.guide)
    const existing = (await exists(file)) ? await readFile(file, 'utf8') : null
    const result = migrateGuide(existing, t, dir, options.runner)
    if (result.kind === 'custom') out.custom.push({ guide: t.guide, block: result.block })
    else if (result.kind !== 'current') {
      await writeFile(file, result.code)
      out.written.push(t.guide)
    }
  }
  return out
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
    dev: 'hozu dev',
    check: 'hozu check',
    start: 'hozu serve',
    build: 'hozu build',
  },
  dependencies: {
    '@hozu/adapter-node': `^${version}`,
    '@hozu/cli': `^${version}`,
    '@hozu/core': `^${version}`,
    '@hozu/css': `^${version}`,
    '@hozu/data': `^${version}`,
    '@hozu/runtime-server': `^${version}`,
    '@hozu/schema-zod': `^${version}`,
    '@hozu/transform': `^${version}`,
    zod: '^4.6.5',
  },
  devDependencies: {
    '@hozu/dev': `^${version}`,
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
    await writeFile(target, (await readFile(source, 'utf8')).replaceAll('__NAME__', options.name))
    written.push(relative(dir, target))
  }
  await writeFile(
    join(dir, 'package.json'),
    `${JSON.stringify(packageJson(options.name, options.version), null, 2)}\n`,
  )
  written.push('package.json')
  written.push(...(await writeAgentFiles(dir, options.agent, options)).written)
  return written
}
