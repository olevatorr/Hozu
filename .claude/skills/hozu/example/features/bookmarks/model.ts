import { event, fn, invoke, machine, mutation, on, query, tag, ui } from '@hozu/core'
import { z } from 'zod'
import { bookmarkPage, Show } from '../../routes.ts'

export const Kind = z.enum(['article', 'video', 'podcast'])
export const Bookmark = z.object({ id: z.string(), title: z.string(), kind: Kind, read: z.boolean() })
const Bookmarks = z.array(Bookmark)
const BookmarkKey = z.object({ id: z.string() })
const NewBookmark = z.object({
  title: z.string().min(2, 'Use at least 2 characters').max(80, 'Use at most 80 characters'),
  kind: Kind,
})

export const Draft = event({ payload: z.object({ text: z.string() }) })
export const Add = event({ payload: z.object({ title: z.string(), kind: Kind }) })
export const ToggleRead = event({ payload: BookmarkKey })

export const bookmarksTag = tag({ param: null })

export const listBookmarks = query({
  input: z.object({}),
  output: Bookmarks,
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

export const DUPLICATE = 'This bookmark already exists'

export const bookmarksMachine = machine({
  context: z.object({
    draft: z.string(),
    kind: Kind,
    target: z.string(),
    error: z.string().nullable(),
    fields: z.object({ title: z.string().nullable(), kind: z.string().nullable() }),
  }),
  initialContext: {
    draft: '',
    kind: 'article',
    target: '',
    error: null,
    fields: { title: null, kind: null },
  },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Draft, {
          target: 'idle',
          assign: (e) => {
            ctx.draft = e.text
          },
        }),
        on(Add, {
          target: 'adding',
          assign: (e) => {
            ctx.draft = e.title
            ctx.kind = e.kind
            ctx.error = null
            ctx.fields = { title: null, kind: null }
          },
        }),
        on(ToggleRead, {
          target: 'toggling',
          assign: (e) => {
            ctx.target = e.id
          },
        }),
      ],
    },
    adding: {
      invoke: invoke(addBookmark, {
        input: { title: ctx.draft, kind: ctx.kind },
        done: {
          target: 'idle',
          assign: () => {
            ctx.draft = ''
          },
          navigate: (b) => ui.link(bookmarkPage, { id: b.id }),
        },
        failed: {
          Duplicate: {
            target: 'idle',
            assign: () => {
              ctx.error = DUPLICATE
            },
          },
          Invalid: {
            target: 'idle',
            assign: (e) => {
              ctx.fields = e.fields
            },
          },
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
    toggling: {
      invoke: invoke(toggleRead, {
        input: { id: ctx.target },
        done: 'idle',
        failed: {
          NotFound: 'idle',
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
  }),
})
