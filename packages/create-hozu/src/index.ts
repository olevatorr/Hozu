import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Agent, type AgentOptions, writeAgentFiles } from './agent.ts'

export type { Agent, AgentFiles, AgentOptions } from './agent.ts'
export { AGENTS, defaultSkill, runnerOf, writeAgentFiles } from './agent.ts'
export type { BlockResult, Runner, Target } from './guide.ts'
export { BEGIN, currentGuide, END, guideBlock, migrateGuide, RUNNERS, TARGETS } from './guide.ts'

const templates = fileURLToPath(new URL('../templates', import.meta.url))

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

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
    '@hozu/adapter-static': `^${version}`,
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
    '@hozu/bundle': `^${version}`,
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
