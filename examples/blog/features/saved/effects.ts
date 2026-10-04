import { mutation, query, tag } from '@hozu/core'
import { z } from 'zod'

export const savedTag = tag({ param: null })
const Slug = z.object({ slug: z.string() })

export const savedPosts = query({
  input: z.object({}),
  output: z.array(z.string()),
  scope: 'user',
  freshness: 'live',
  tags: () => [savedTag()],
  runs: 'server',
  access: 'signedIn',
})

export const savePost = mutation({
  input: Slug,
  output: z.array(z.string()),
  errors: { LimitReached: z.object({ limit: z.number() }) },
  invalidates: () => [savedTag()],
  runs: 'server',
  access: 'anyone',
})

export const unsavePost = mutation({
  input: Slug,
  output: z.array(z.string()),
  invalidates: () => [savedTag()],
  runs: 'server',
  access: 'anyone',
})
