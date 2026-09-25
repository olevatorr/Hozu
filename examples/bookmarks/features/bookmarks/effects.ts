import { fn, mutation, query, tag } from '@tenon/core'
import { z } from 'zod'
import { Bookmark, BookmarkKey, Bookmarks, NewBookmark, NoInput, Show } from './schemas.ts'

export const bookmarksTag = tag({ param: null })

export const listBookmarks = query({
  input: NoInput,
  output: Bookmarks,
  errors: {},
  scope: 'public',
  freshness: 'static',
  tags: () => [bookmarksTag()],
})

export const getBookmark = query({
  input: BookmarkKey,
  output: Bookmark,
  errors: { NotFound: BookmarkKey },
  scope: 'public',
  freshness: 'static',
  tags: () => [bookmarksTag()],
})

export const addBookmark = mutation({
  input: NewBookmark,
  output: Bookmark,
  errors: { Duplicate: z.object({ title: z.string() }) },
  invalidates: () => [bookmarksTag()],
})

export const toggleRead = mutation({
  input: BookmarkKey,
  output: Bookmark,
  errors: { NotFound: BookmarkKey },
  invalidates: () => [bookmarksTag()],
})

const Visible = z.object({ items: Bookmarks, show: Show })

export const visible = fn({
  input: Visible,
  output: Bookmarks,
  impl: ({ items, show }) => items.filter((b) => show === 'all' || !b.read),
})

export const isEmpty = fn({
  input: Visible,
  output: z.boolean(),
  impl: ({ items, show }) => !items.some((b) => show === 'all' || !b.read),
})
