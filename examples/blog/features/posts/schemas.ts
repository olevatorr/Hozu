import { z } from 'zod'

export const Summary = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  publishedAt: z.string(),
})
export const Post = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  publishedAt: z.string(),
  author: z.string(),
  body: z.array(z.object({ text: z.string() })),
})
export const SlugInput = z.object({ slug: z.string() })
export const NoInput = z.object({})
