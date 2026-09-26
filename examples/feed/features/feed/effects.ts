import { query, tag } from '@tenon/core'
import { z } from 'zod'
import { Item, Page } from './schemas.ts'

export const itemsTag = tag({ param: null })

export const listPage = query({
  input: z.object({ cursor: z.string().nullable() }),
  output: Page,
  scope: 'public',
  freshness: 'static',
  tags: () => [itemsTag()],
})

export const byTag = query({
  input: z.object({ path: z.array(z.string()) }),
  output: z.array(Item),
  scope: 'public',
  freshness: 'static',
  tags: () => [itemsTag()],
})

export const byYear = query({
  input: z.object({ year: z.string().nullable() }),
  output: z.array(Item),
  scope: 'public',
  freshness: 'static',
  tags: () => [itemsTag()],
})

export const listTags = query({
  input: z.object({}),
  output: z.array(z.object({ path: z.array(z.string()) })),
  scope: 'public',
  freshness: 'static',
  tags: () => [itemsTag()],
})

export const listYears = query({
  input: z.object({}),
  output: z.array(z.object({ year: z.string().nullable() })),
  scope: 'public',
  freshness: 'static',
  tags: () => [itemsTag()],
})
