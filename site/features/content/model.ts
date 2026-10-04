import { query } from '@hozu/core'
import { z } from 'zod'

export const Frontmatter = z.object({ title: z.string(), description: z.string(), order: z.number() })
export const Summary = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  order: z.number(),
})
export const Article = Summary.extend({
  html: z.string(),
  headings: z.array(z.object({ id: z.string(), text: z.string(), depth: z.number(), href: z.string() })),
  hasCode: z.boolean(),
  previous: z.array(Summary),
  next: z.array(Summary),
})
export const Slug = z.object({ slug: z.string() })
export const listDocs = query({
  input: z.object({}),
  output: z.array(Summary),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
export const getDoc = query({
  input: Slug,
  output: Article,
  errors: { NotFound: Slug },
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
export const listTrials = query({
  input: z.object({}),
  output: z.array(Summary),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
export const getTrial = query({
  input: Slug,
  output: Article,
  errors: { NotFound: Slug },
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
export const getChangelog = query({
  input: z.object({}),
  output: z.object({ html: z.string(), hasCode: z.boolean() }),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})

export const listChapters = query({
  input: z.object({}),
  output: z.array(Summary),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
export const getChapter = query({
  input: Slug,
  output: Article,
  errors: { NotFound: Slug },
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
export const getStart = query({
  input: z.object({}),
  output: z.object({ html: z.string() }),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
export const getRelease = query({
  input: z.object({}),
  output: z.object({ version: z.string() }),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
