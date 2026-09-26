import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { AGENTS, type Agent, runnerOf, writeAgentFiles } from 'create-tenon'
import type { SkillOutput } from '../contract.ts'
import { TenonCliError } from '../errors.ts'

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

export async function runSkill(cwd: string, requested: string | undefined): Promise<SkillOutput> {
  let agent = requested as Agent | undefined
  if (agent && !AGENTS.includes(agent))
    throw new TenonCliError('usage', `--agent must be one of ${AGENTS.join(', ')}`, [...AGENTS])
  if (!agent) {
    const claude = await exists(join(cwd, '.claude/skills/tenon'))
    const agents = await exists(join(cwd, '.agents/skills/tenon'))
    agent = claude && agents ? 'both' : claude ? 'claude' : agents ? 'agents' : undefined
  }
  if (!agent)
    throw new TenonCliError('usage', 'No Tenon skill in this directory yet; choose where to write it', [
      'tenon skill --agent claude   (CLAUDE.md + .claude/skills/tenon)',
      'tenon skill --agent agents   (AGENTS.md + .agents/skills/tenon)',
      'tenon skill --agent both',
    ])
  const written = await writeAgentFiles(cwd, agent, {
    name: basename(cwd),
    runner: runnerOf(process.env.npm_config_user_agent),
  })
  return { written }
}
