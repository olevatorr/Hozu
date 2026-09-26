import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { AGENTS, type Agent, createApp, runnerOf } from './index.ts'

const usage = `Usage: create-tenon [directory] [--agent claude|agents|both]

  --agent claude   CLAUDE.md + .claude/skills/tenon (Claude Code)
  --agent agents   AGENTS.md + .agents/skills/tenon (Codex, Cursor, Copilot and other agents)
  --agent both     both
`

const supported = () => {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
  return major > 22 || (major === 22 && minor >= 18)
}

export async function main(argv: string[]): Promise<number> {
  if (!supported()) {
    process.stderr.write(`Tenon needs Node 22.18 or newer (this is ${process.versions.node}).\n`)
    return 1
  }
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { agent: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  })
  if (values.help) {
    process.stdout.write(usage)
    return 0
  }
  const interactive = process.stdin.isTTY === true
  const ask = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null
  try {
    let dir = positionals[0]
    if (!dir) {
      if (!ask) throw new Error('Give a directory: create-tenon my-app --agent claude')
      dir = (await ask.question('Project directory (my-tenon-app): ')).trim() || 'my-tenon-app'
    }
    let agent = values.agent as Agent | undefined
    if (agent && !AGENTS.includes(agent)) throw new Error(`--agent must be one of ${AGENTS.join(', ')}`)
    if (!agent) {
      if (!ask) throw new Error('Choose the coding agent: --agent claude|agents|both')
      const answer = (
        await ask.question(
          'Which coding agent will work on this app?\n  1) Claude Code (CLAUDE.md)\n  2) Other agents (AGENTS.md)\n  3) Both\nChoose 1-3 (1): ',
        )
      ).trim()
      agent = AGENTS[Number(answer || '1') - 1] ?? 'claude'
    }
    const target = resolve(dir)
    const version = (
      JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    ).version
    const runner = runnerOf(process.env.npm_config_user_agent)
    await createApp(target, { name: basename(target), agent, version, runner })
    const install =
      runner === 'npx' ? 'npm install' : runner === 'bunx' ? 'bun install' : `${runner.split(' ')[0]} install`
    process.stdout.write(
      `\nCreated ${basename(target)} for ${agent === 'both' ? 'Claude Code and other agents' : agent === 'claude' ? 'Claude Code' : 'other agents'}.\n\n  cd ${dir}\n  ${install}\n  ${runner === 'pnpm exec' ? 'pnpm' : runner === 'npx' ? 'npm' : runner.split(' ')[0]} start\n\n`,
    )
    return 0
  } catch (error) {
    process.stderr.write(`create-tenon: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  } finally {
    ask?.close()
  }
}
