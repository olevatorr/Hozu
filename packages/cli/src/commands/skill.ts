import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { AGENTS, type Agent, runnerOf, writeAgentFiles } from 'create-hozu'
import type { SkillOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

export async function runSkill(cwd: string, requested: string | undefined): Promise<SkillOutput> {
  let agent = requested as Agent | undefined
  if (agent && !AGENTS.includes(agent))
    throw new HozuCliError('usage', `--agent must be one of ${AGENTS.join(', ')}`, [...AGENTS])
  if (!agent) {
    const claude = await exists(join(cwd, '.claude/skills/hozu'))
    const agents = await exists(join(cwd, '.agents/skills/hozu'))
    agent = claude && agents ? 'both' : claude ? 'claude' : agents ? 'agents' : undefined
  }
  if (!agent)
    throw new HozuCliError('usage', 'No Hozu skill in this directory yet; choose where to write it', [
      'hozu skill --agent claude   (CLAUDE.md + .claude/skills/hozu)',
      'hozu skill --agent agents   (AGENTS.md + .agents/skills/hozu)',
      'hozu skill --agent both',
    ])
  return writeAgentFiles(cwd, agent, {
    name: basename(cwd),
    runner: runnerOf(process.env.npm_config_user_agent),
  })
}
