import { readdir, readFile } from 'node:fs/promises'
import type { Infer, Schema } from '@tenonkit/core'
import { toParse } from '@tenonkit/core/ir'
import { Marked, type Tokens } from 'marked'
import { parse as parseYaml } from 'yaml'

export interface Heading {
  depth: number
  text: string
  id: string
}

export interface Entry<T> {
  slug: string
  data: T
  html: string
  headings: Heading[]
}

export class ContentError extends Error {
  override name = 'ContentError'
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'section'

function render(markdown: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = []
  const used = new Map<string, number>()
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const text = tokens.map((t) => ('text' in t ? t.text : t.raw)).join('')
        const base = slugify(text)
        const n = used.get(base) ?? 0
        used.set(base, n + 1)
        const id = n ? `${base}-${n + 1}` : base
        headings.push({ depth, text, id })
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
    },
  })
  return { html: marked.parse(markdown, { async: false }) as string, headings }
}

export function parseCollection<S extends Schema>({
  files,
  schema,
}: {
  files: Record<string, string>
  schema: S
}): Entry<Infer<S>>[] {
  const check = toParse(schema)
  if (!check) throw new ContentError('The collection schema is not a Standard Schema')
  return Object.keys(files)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const text = files[name]!
      const front = FRONT_MATTER.exec(text)
      let raw: unknown = {}
      try {
        raw = front ? (parseYaml(front[1]!) ?? {}) : {}
      } catch (error) {
        throw new ContentError(`${name}: invalid front matter: ${(error as Error).message}`)
      }
      const parsed = check(raw)
      if (!parsed.ok) throw new ContentError(`${name}: ${parsed.issues.join('; ')}`)
      return {
        slug: name.slice(0, -3),
        data: parsed.value as Infer<S>,
        ...render(front ? text.slice(front[0].length) : text),
      }
    })
}

export async function loadCollection<S extends Schema>({
  dir,
  schema,
}: {
  dir: URL
  schema: S
}): Promise<Entry<Infer<S>>[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.md'))
  const files = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await readFile(new URL(name, dir), 'utf8')] as const)),
  )
  return parseCollection({ files, schema })
}
