import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const skill = join(root, '.claude/skills/hozu')

export const exampleFiles = [
  'app.css',
  'routes.ts',
  'server.ts',
  'serve.ts',
  'hozu.config.ts',
  'features/bookmarks/model.ts',
  'features/bookmarks/views.ts',
  'features/bookmarks/feature.ts',
]

export const agentsMd = (claude: string) =>
  `${claude.replace(
    /^# (.+)\n/,
    '# $1\n\nAgents without skill support: before writing Hozu code, read `.claude/skills/hozu/SKILL.md` (the `hozu` skill below).\n',
  )}`

export async function sync(write: boolean): Promise<string[]> {
  const stale: string[] = []
  const put = async (path: string, text: string) => {
    const current = await readFile(path, 'utf8').catch(() => null)
    if (current === text) return
    stale.push(path.slice(root.length))
    if (!write) return
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  }
  for (const f of exampleFiles)
    await put(join(skill, 'example', f), await readFile(join(root, 'examples/bookmarks', f), 'utf8'))
  await put(join(root, 'AGENTS.md'), agentsMd(await readFile(join(root, 'CLAUDE.md'), 'utf8')))
  return stale
}

export async function pack() {
  const target = join(root, 'packages/create-hozu/skill')
  await rm(target, { recursive: true, force: true })
  await cp(skill, target, { recursive: true })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stale = process.argv.includes('--pack') ? [] : await sync(true)
  await pack()
  process.stdout.write(stale.length ? `updated ${stale.join(', ')}\n` : 'skill copies are current\n')
}
