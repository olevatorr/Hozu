import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { closest } from '@hozu/validator'
import { defaultSkill } from 'create-hozu'
import type { DocsOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'

export async function runDocs(cwd: string, topic: string | undefined): Promise<DocsOutput> {
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
  return { topic: name, text: await readFile(join(dir, `${name}.md`), 'utf8'), topics }
}
