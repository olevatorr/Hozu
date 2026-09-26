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
  html: z.string(),
})
export const Frontmatter = z.object({
  title: z.string(),
  excerpt: z.string(),
  publishedAt: z.string(),
  author: z.string(),
})
export const SlugInput = z.object({ slug: z.string() })
export const NoInput = z.object({})
