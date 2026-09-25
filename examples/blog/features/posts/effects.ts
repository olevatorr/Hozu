import { fn, query, tag } from '@tenon/core'
import { z } from 'zod'
import { NoInput, Post, SlugInput, Summary } from './schemas.ts'

export const postsTag = tag({ param: null })
export const postTag = tag({ param: z.string() })

export const listPosts = query({
  input: NoInput,
  output: z.array(Summary),
  errors: {},
  scope: 'public',
  freshness: { revalidate: 300 },
  tags: () => [postsTag()],
})

export const getPost = query({
  input: SlugInput,
  output: Post,
  errors: { NotFound: SlugInput },
  scope: 'public',
  freshness: 'static',
  tags: (input) => [postTag(input.slug)],
})

export const postPath = fn({ input: z.string(), output: z.string(), impl: (slug) => `/posts/${slug}` })
