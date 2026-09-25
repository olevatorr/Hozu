import { z } from 'zod'

export const Kind = z.enum(['article', 'video', 'podcast'])
export const Show = z.enum(['all', 'unread'])
export const Bookmark = z.object({ id: z.string(), title: z.string(), kind: Kind, read: z.boolean() })
export const Bookmarks = z.array(Bookmark)
export const BookmarkKey = z.object({ id: z.string() })
export const NewBookmark = z.object({ title: z.string(), kind: Kind })
export const NoInput = z.object({})
export const Context = z.object({
  draft: z.string(),
  kind: Kind,
  target: z.string(),
  error: z.string().nullable(),
})
