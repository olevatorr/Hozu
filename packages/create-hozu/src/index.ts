import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Agent, type AgentOptions, writeAgentFiles } from './agent.ts'
import { installUi, UI_KIT } from './ui.ts'

export type { Agent, AgentFiles, AgentOptions } from './agent.ts'
export { AGENTS, defaultSkill, runnerOf, writeAgentFiles } from './agent.ts'
export type { BlockResult, Runner, Target } from './guide.ts'
export { BEGIN, currentGuide, END, guideBlock, migrateGuide, RUNNERS, TARGETS } from './guide.ts'
export { fetchUiKit, installUi, UI_KIT } from './ui.ts'

const templates = fileURLToPath(new URL('../templates', import.meta.url))

const UI_HOME = `import { ui } from '@hozu/core'
import { LinkButton } from '../../ui/button.ts'
import { PageHeader } from '../../ui/page-header.ts'

export const Home = ui.view({
  render: () =>
    ui.main({ class: 'mx-auto max-w-xl space-y-6 px-4 py-12' }, [
      ui.use(PageHeader, { props: { title: 'Hello, Hozu', description: 'Edit features/site/views.ts to get started.' } }),
      ui.use(LinkButton, { variant: { intent: 'primary' }, props: { href: 'https://hozu.org' } }, ['Read the guide']),
    ]),
})
`

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
  /** The unpacked `@hozu/ui-kit` to copy into `ui/` (ADR 0089); omitted, the app has no kit. */
  ui?: string
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
  const pkg: { dependencies: Record<string, string>; devDependencies: Record<string, string> } = packageJson(
    options.name,
    options.version,
  )
  if (options.ui) {
    const { version, written: kit, previews } = await installUi(dir, options.ui)
    written.push(...kit)
    pkg.dependencies['@hozu/variants'] = `^${options.version}`
    pkg.devDependencies[UI_KIT] = `^${version}`
    pkg.dependencies = Object.fromEntries(
      Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
    )
    pkg.devDependencies = Object.fromEntries(
      Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
    )
    const config = join(dir, 'hozu.config.ts')
    const template = await readFile(config, 'utf8')
    if (
      !template.includes("import { home } from './routes.ts'\n") ||
      !template.includes('  features: [site],')
    )
      throw new Error(
        'the app template changed: hozu.config.ts no longer has the lines Hozu UI registers its kit beside',
      )
    await writeFile(
      config,
      template
        .replace(
          "import { home } from './routes.ts'\n",
          "import { home } from './routes.ts'\nimport { kit as uiKit } from './ui/kit.ts'\n",
        )
        .replace(
          '  features: [site],',
          `  kits: [uiKit],\n${previews ? `  previews: [new URL('./ui/${previews}', import.meta.url)],\n` : ''}  features: [site],`,
        ),
    )
    const views = join(dir, 'features/site/views.ts')
    await writeFile(views, UI_HOME)
  }
  await writeFile(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  written.push('package.json')
  written.push(...(await writeAgentFiles(dir, options.agent, options)).written)
  return written
}
