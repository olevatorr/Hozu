import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrateGuide, type Runner, TARGETS } from './guide.ts'

export type Agent = 'claude' | 'agents' | 'both'
export const AGENTS: readonly Agent[] = ['claude', 'agents', 'both']

export const defaultSkill = fileURLToPath(new URL('../skill', import.meta.url))

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
