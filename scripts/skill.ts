import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codes } from '../packages/core/src/ir/codes.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const skill = join(root, '.claude/skills/hozu')

export const exampleFiles = [
  'app.css',
  'routes.ts',
  'app.ts',
  'hozu.config.ts',
  'previews.ts',
  'features/bookmarks/model.ts',
  'features/bookmarks/views.ts',
  'features/bookmarks/feature.ts',
  'ui/kit.ts',
  'ui/tv.ts',
  'ui/button.ts',
  'ui/input.ts',
  'ui/field.ts',
  'ui/badge.ts',
]

export const cliCopies = [
  ['packages/create-hozu/src/agent.ts', 'packages/cli/src/agent.ts'],
  ['packages/create-hozu/src/guide.ts', 'packages/cli/src/guide.ts'],
  ['packages/create-hozu/templates/guide.md', 'packages/cli/templates/guide.md'],
] as const

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
  for (const [from, to] of cliCopies) await put(join(root, to), await readFile(join(root, from), 'utf8'))
  await put(join(skill, 'topics/diagnostics.md'), diagnosticsTopic())
  const site = join(root, 'site/content/docs/diagnostics.md')
  const page = await readFile(site, 'utf8')
  await put(site, page.replace(/(<!-- codes -->\n)[\s\S]*?(\n<!-- \/codes -->)/, `$1${codeTable()}$2`))
  return stale
}

const cell = (s: string) => s.replace(/\|/g, '\\|')

/** Every diagnostic code from the registry (ADR 0053 D): the table the guide and the site show. */
export const codeTable = () =>
  [
    '| Code | Meaning | Usual fix |',
    '| --- | --- | --- |',
    ...Object.entries(codes).map(
      ([code, c]) =>
        `| ${code}${c.severity === 'warning' ? ' (warning)' : ''} | ${cell(c.summary)} | ${cell(c.fix)} |`,
    ),
  ].join('\n')

const warnings = () =>
  Object.entries(codes)
    .filter(([, c]) => c.severity === 'warning')
    .map(([code]) => code)
    .join(', ')

export const diagnosticsTopic = () =>
  `# Hozu diagnostics

Every diagnostic carries \`file:line\`, a cause and a fix, and often a snippet or patch. Apply the fix; do not work
around the rule. \`npx hozu docs HZ083\` prints one code: its cause, its fix and the topic to read.

- Errors fail \`hozu check\`. Warnings (${warnings()}) do not, but each one names something to decide.
- A warning you keep on purpose goes in \`project({ accept: [{ code, at, reason }] })\`; errors cannot be accepted.

<!-- more -->

${codeTable()}
`

export async function pack() {
  for (const owner of ['create-hozu', 'cli']) {
    const target = join(root, 'packages', owner, 'skill')
    await rm(target, { recursive: true, force: true })
    await cp(skill, target, { recursive: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stale = process.argv.includes('--pack') ? [] : await sync(true)
  await pack()
  process.stdout.write(stale.length ? `updated ${stale.join(', ')}\n` : 'skill copies are current\n')
}
