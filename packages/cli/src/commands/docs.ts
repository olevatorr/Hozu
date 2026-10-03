import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { codes, type DiagnosticCode } from '@hozu/core/ir'
import { closest } from '@hozu/validator'
import { defaultSkill } from 'create-hozu'
import type { DocsComponentsOutput, DocsOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { load } from '../load.ts'
import { componentEntries, describeCatalog, docsComponent } from './components.ts'

const MORE = '\n<!-- more -->\n'

/** A topic's short form, or all of it with `--more` (ADR 0053 E); the marker line is never printed. */
export function shortForm(text: string, name: string, more: boolean): string {
  const at = text.indexOf(MORE)
  if (at < 0) return text
  return more
    ? text.slice(0, at) + text.slice(at + MORE.length)
    : `${text.slice(0, at).trimEnd()}\n\nMore (options, edge cases): hozu docs ${name} --more\n`
}

export async function runDocs(
  cwd: string,
  topic: string | undefined,
  config?: string,
  more = false,
): Promise<DocsOutput | DocsComponentsOutput> {
  const local = [join(cwd, '.claude/skills/hozu/topics'), join(cwd, '.agents/skills/hozu/topics')].find((d) =>
    existsSync(d),
  )
  const bundled = join(defaultSkill, 'topics')
  const dir = existsSync(bundled) ? bundled : local
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
  const code = topic.toUpperCase() as DiagnosticCode
  if (/^HZ\d{3}$/.test(code)) {
    const c = codes[code]
    if (!c)
      throw new HozuCliError('usage', `No diagnostic ${code}`, ['hozu docs diagnostics lists every code'])
    const text = `${code} ${c.name} (${c.severity})\n\n${c.summary}\n\nfix: ${c.fix}\nread: hozu docs ${c.topic}\n`
    return { topic: code, text, topics }
  }
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
  const fresh = await readFile(join(dir, `${name}.md`), 'utf8')
  const copy =
    local && dir !== local ? await readFile(join(local, `${name}.md`), 'utf8').catch(() => null) : null
  const shown = shortForm(fresh, name, more)
  const text =
    copy !== null && copy !== fresh
      ? `${shown}\n> The skill copy in ${local!.slice(cwd.length + 1, -'/topics'.length)} is older than this Hozu; run npx hozu skill to refresh it.\n`
      : shown
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
