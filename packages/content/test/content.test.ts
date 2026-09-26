import { ContentError, loadCollection, parseCollection } from '@tenonkit/content'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Front = z.object({ title: z.string(), draft: z.boolean().default(false) })

describe('@tenonkit/content (ADR 0020)', () => {
  it('parses front matter with the schema, renders GFM and collects heading ids', () => {
    const [entry] = parseCollection({
      files: {
        'intro.md':
          '---\ntitle: Intro\n---\n# Getting started\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n## Getting started\n\n## Café ☕\n',
        'notes.txt': 'ignored',
      },
      schema: Front,
    })
    expect(entry!.slug).toBe('intro')
    expect(entry!.data).toEqual({ title: 'Intro', draft: false })
    expect(entry!.headings).toEqual([
      { depth: 1, text: 'Getting started', id: 'getting-started' },
      { depth: 2, text: 'Getting started', id: 'getting-started-2' },
      { depth: 2, text: 'Café ☕', id: 'cafe' },
    ])
    expect(entry!.html).toContain('<h1 id="getting-started">Getting started</h1>')
    expect(entry!.html).toContain('<table>')
  })

  it('names the file when its front matter is invalid', () => {
    expect(() =>
      parseCollection({ files: { 'bad.md': '---\ndraft: yes please\n---\nx' }, schema: Front }),
    ).toThrow(ContentError)
    expect(() => parseCollection({ files: { 'bad.md': '---\ndraft: 1\n---\nx' }, schema: Front })).toThrow(
      /^bad\.md: /,
    )
    expect(() => parseCollection({ files: { 'bad.md': '---\n: : :\n---\nx' }, schema: Front })).toThrow(
      /bad\.md: invalid front matter/,
    )
  })

  it('loads a folder, sorted by file name', async () => {
    const entries = await loadCollection({
      dir: new URL('../../../examples/blog/content/posts/', import.meta.url),
      schema: z.object({
        title: z.string(),
        excerpt: z.string(),
        publishedAt: z.string(),
        author: z.string(),
      }),
    })
    expect(entries.map((e) => e.slug)).toEqual(['hello-tenon', 'islands-explained', 'tenon-roadmap'])
    expect(entries[1]!.html).toBe(
      '<p>Render modes are derived from data <strong>freshness</strong> and <strong>scope</strong>.</p>\n',
    )
  })
})
