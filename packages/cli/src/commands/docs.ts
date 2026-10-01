import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { closest } from '@hozu/validator'
import { defaultSkill } from 'create-hozu'
import type { DocsComponentsOutput, DocsOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { load } from '../load.ts'
import { componentEntries, describeCatalog, docsComponent } from './components.ts'

export async function runDocs(
  cwd: string,
  topic: string | undefined,
  config?: string,
): Promise<DocsOutput | DocsComponentsOutput> {
  const dir = [
    join(cwd, '.claude/skills/hozu/topics'),
    join(cwd, '.agents/skills/hozu/topics'),
    join(defaultSkill, 'topics'),
  ].find((d) => existsSync(d))
  if (!dir) throw new HozuCliError('config', 'No Hozu topics found; run hozu skill to write the skill', [])
  const topics = await Promise.all(
    (await readdir(dir))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map(async (f) => ({
        name: f.slice(0, -3),
        title: (await readFile(join(dir, f), 'utf8')).split('\n')[0]!.replace(/^#\s*/, ''),
      })),
  )
  if (!topic) {
    const text = `${topics.map((t) => `${t.name.padEnd(12)} ${t.title}`).join('\n')}\n`
    return { topic: null, text, topics }
  }
  const name = topic.toLowerCase()
  if (!topics.some((t) => t.name === name)) {
    const guess = closest(
      name,
      topics.map((t) => t.name),
    )
    throw new HozuCliError('usage', `No topic "${topic}"`, [
      ...(guess ? [`hozu docs ${guess}`] : []),
      `topics: ${topics.map((t) => t.name).join(', ')}`,
    ])
  }
  const text = await readFile(join(dir, `${name}.md`), 'utf8')
  if (name === 'components') return catalog(cwd, config, text)
  return { topic: name, text, topics }
}

async function catalog(
  cwd: string,
  config: string | undefined,
  topic: string,
): Promise<DocsComponentsOutput> {
  if (!existsSync(resolve(cwd, config ?? 'hozu.config.ts'))) return { text: topic, components: [] }
  const { ir } = (await load(config, cwd)).build()
  const components = componentEntries(ir).map(docsComponent)
  return { text: topic + describeCatalog(components), components }
}
