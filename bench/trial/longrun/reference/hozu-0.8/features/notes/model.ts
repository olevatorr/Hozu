import { endpoint, event, fn, invoke, machine, mutation, on, query, tag, ui } from '@hozu/core'
import { z } from 'zod'

export const Note = z.object({
  id: z.string(),
  title: z.string(),
  pinned: z.boolean(),
  sharedWith: z.array(z.string()),
  createdAt: z.string(),
})
export type NoteT = z.infer<typeof Note>
const Notes = z.array(Note)
const NoteKey = z.object({ id: z.string() })
const NewNote = z.object({ title: z.string().min(1, 'Write something') })

export const Draft = event({ payload: z.object({ title: z.string() }) })
export const Add = event({ payload: z.object({ title: z.string() }) })
export const Remove = event({ payload: NoteKey })
export const Pin = event({ payload: NoteKey })
export const Edit = event({ payload: NoteKey })
export const CancelEdit = event({ payload: z.object({}) })
export const Save = event({ payload: z.object({ id: z.string(), title: z.string() }) })
export const Archive = event({ payload: NoteKey })
export const Restore = event({ payload: NoteKey })
export const Undo = event({ payload: z.object({}) })
export const Select = event({ payload: z.object({ id: z.string(), checked: z.boolean() }) })
const ShareKey = z.object({ id: z.string(), to: z.string() })
export const Share = event({ payload: ShareKey })
export const Unshare = event({ payload: ShareKey })
export const Search = event({ payload: z.object({ query: z.string() }) })

export const notesTag = tag({ param: null })

export const notesApi = endpoint({
  method: 'GET',
  path: '/api/notes',
  input: z.object({}),
  output: z.object({ signedIn: z.boolean(), notes: z.array(Note) }),
})

export const bulkNotes = endpoint({
  method: 'POST',
  path: '/api/notes/bulk',
  input: z.object({ action: z.enum(['delete', 'archive']), ids: z.array(z.string()) }),
  output: 'redirect',
})

export const exportAll = endpoint({
  method: 'GET',
  path: '/api/export',
  input: z.object({}),
  output: z.object({
    user: z.string(),
    notes: z.array(
      z.object({ title: z.string(), pinned: z.boolean(), archived: z.boolean(), createdAt: z.string() }),
    ),
  }),
  errors: { Unauthorized: z.object({ message: z.string() }) },
  failed: { Unauthorized: 401 },
})

export const listNotes = query({
  input: z.object({ q: z.string(), limit: z.number() }),
  output: z.object({ notes: Notes, matching: z.number(), total: z.number() }),
  errors: { Unauthorized: z.object({}) },
  scope: 'user',
  freshness: 'live',
  tags: () => [notesTag()],
})

export const listArchived = query({
  input: z.object({}),
  output: Notes,
  errors: { Unauthorized: z.object({}) },
  scope: 'user',
  freshness: 'request',
  tags: () => [notesTag()],
})

export const lastDeleted = query({
  input: z.object({}),
  output: z.object({ title: z.string() }).nullable(),
  scope: 'user',
  freshness: 'live',
  tags: () => [notesTag()],
})

export const undoDelete = mutation({
  input: z.object({}),
  output: NoteKey,
  errors: { NotFound: z.object({}) },
  invalidates: () => [notesTag()],
})

export const sharedWithMe = query({
  input: z.object({}),
  output: z.array(z.object({ id: z.string(), title: z.string(), owner: z.string() })),
  scope: 'user',
  freshness: 'live',
  tags: () => [notesTag()],
})

export const shareNote = mutation({
  input: z.object({ id: z.string(), to: z.string().regex(/^\s*[A-Za-z]{2,20}\s*$/, 'Use 2–20 letters') }),
  output: NoteKey,
  errors: { NotFound: NoteKey, Self: z.object({}) },
  invalidates: () => [notesTag()],
})

export const unshareNote = mutation({
  input: ShareKey,
  output: NoteKey,
  errors: { NotFound: NoteKey },
  invalidates: () => [notesTag()],
})

export const addNote = mutation({
  input: NewNote,
  output: Note,
  errors: { Duplicate: z.object({ title: z.string() }), TooMany: z.object({}) },
  invalidates: () => [notesTag()],
})

export const removeNote = mutation({
  input: NoteKey,
  output: NoteKey,
  errors: { NotFound: NoteKey },
  invalidates: () => [notesTag()],
})

export const togglePin = mutation({
  input: NoteKey,
  output: Note,
  errors: { NotFound: NoteKey },
  invalidates: () => [notesTag()],
})

export const archiveNote = mutation({
  input: NoteKey,
  output: NoteKey,
  errors: { NotFound: NoteKey },
  invalidates: () => [notesTag()],
})

export const restoreNote = mutation({
  input: NoteKey,
  output: NoteKey,
  errors: { NotFound: NoteKey },
  invalidates: () => [notesTag()],
})

export const renameNote = mutation({
  input: z.object({ id: z.string(), title: z.string().min(1, 'Write something') }),
  output: Note,
  errors: { Duplicate: z.object({ title: z.string() }), NotFound: NoteKey },
  invalidates: () => [notesTag()],
})

const Visible = z.object({ items: Notes, query: z.string() })

export const matches = (n: NoteT, query: string) => n.title.toLowerCase().includes(query.trim().toLowerCase())

export const visible = fn({
  input: Visible,
  output: Notes,
  impl: ({ items, query }) => items.filter((n) => matches(n, query)),
})

export const noMatch = fn({
  input: Visible,
  output: z.boolean(),
  impl: ({ items, query }) => !items.some((n) => matches(n, query)),
})

export const listed = fn({
  input: Visible,
  output: z.number(),
  impl: ({ items, query }) => items.filter((n) => matches(n, query)).length,
})

export const addedDay = fn({
  input: z.object({ at: z.string() }),
  output: z.string(),
  impl: ({ at }) => at.slice(0, 10),
})

export const text = ui.messages('en', {
  en: {
    notes: 'Notes',
    count: 'Notes: {count}',
    title: 'Title',
    add: 'Add',
    delete: 'Delete',
    search: 'Search',
    duplicate: 'You already have a note with this title',
  },
  de: {
    notes: 'Notizen',
    count: 'Notizen: {count}',
    title: 'Titel',
    add: 'Hinzufügen',
    delete: 'Löschen',
    search: 'Suche',
    duplicate: 'Du hast bereits eine Notiz mit diesem Titel',
  },
})

export const MAX_TITLE = 60
export const TOO_LONG = `Use at most ${MAX_TITLE} characters`
export const TOO_MANY = 'Too many notes, try again in a minute'
export const SELF_SHARE = 'You cannot share with yourself'
export const DUPLICATE = 'You already have a note with this title'
export const GONE = 'This note no longer exists'

export const notesMachine = machine({
  context: z.object({
    draft: z.string(),
    query: z.string(),
    target: z.string(),
    editing: z.string(),
    selected: z.array(NoteKey),
    editTitle: z.string(),
    shareTo: z.string(),
    error: z.string().nullable(),
    fields: z.object({ title: z.string().nullable() }),
  }),
  initialContext: {
    draft: '',
    query: '',
    target: '',
    editing: '',
    selected: [],
    editTitle: '',
    shareTo: '',
    error: null,
    fields: { title: null },
  },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Draft, {
          target: 'idle',
          assign: (e) => {
            ctx.draft = e.title
          },
        }),
        on(Add, {
          target: 'adding',
          assign: (e) => {
            ctx.draft = e.title
            ctx.error = null
            ctx.fields = { title: null }
          },
        }),
        on(Remove, {
          target: 'removing',
          assign: (e) => {
            ctx.target = e.id
            ctx.error = null
          },
        }),
        on(Pin, {
          target: 'pinning',
          assign: (e) => {
            ctx.target = e.id
            ctx.error = null
          },
        }),
        on(Archive, {
          target: 'archiving',
          assign: (e) => {
            ctx.target = e.id
            ctx.error = null
          },
        }),
        on(Restore, {
          target: 'restoring',
          assign: (e) => {
            ctx.target = e.id
            ctx.error = null
          },
        }),
        on(Select, {
          target: 'idle',
          guard: (e) => e.checked === true,
          assign: (e) => {
            ctx.selected.push({ id: e.id })
          },
        }),
        on(Select, {
          target: 'idle',
          assign: (e) => {
            ctx.selected = ctx.selected.filter((s) => s.id !== e.id)
          },
        }),
        on(Share, {
          target: 'sharing',
          assign: (e) => {
            ctx.target = e.id
            ctx.shareTo = e.to
            ctx.error = null
          },
        }),
        on(Unshare, {
          target: 'unsharing',
          assign: (e) => {
            ctx.target = e.id
            ctx.shareTo = e.to
            ctx.error = null
          },
        }),
        on(Undo, {
          target: 'undoing',
          assign: () => {
            ctx.error = null
          },
        }),
        on(Search, {
          target: 'idle',
          assign: (e) => {
            ctx.query = e.query
          },
        }),
        on(Edit, {
          target: 'idle',
          assign: (e) => {
            ctx.editing = e.id
            ctx.error = null
          },
        }),
        on(CancelEdit, {
          target: 'idle',
          assign: () => {
            ctx.editing = ''
          },
        }),
        on(Save, {
          target: 'saving',
          assign: (e) => {
            ctx.target = e.id
            ctx.editing = e.id
            ctx.editTitle = e.title
            ctx.error = null
          },
        }),
      ],
    },
    adding: {
      invoke: invoke(addNote, {
        input: { title: ctx.draft },
        done: [
          {
            target: 'idle',
            assign: () => {
              ctx.draft = ''
            },
          },
        ],
        failed: {
          Duplicate: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = DUPLICATE
              },
            },
          ],
          TooMany: {
            target: 'idle',
            assign: () => {
              ctx.error = TOO_MANY
            },
          },
          Invalid: {
            target: 'idle',
            assign: (e) => {
              ctx.fields = { title: e.fields.title ?? null }
            },
          },
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
    removing: {
      invoke: invoke(removeNote, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = GONE
              },
            },
          ],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
    saving: {
      invoke: invoke(renameNote, {
        input: { id: ctx.target, title: ctx.editTitle },
        done: [
          {
            target: 'idle',
            assign: () => {
              ctx.editing = ''
            },
          },
        ],
        failed: {
          Duplicate: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = DUPLICATE
              },
            },
          ],
          NotFound: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = GONE
                ctx.editing = ''
              },
            },
          ],
          Invalid: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
    archiving: {
      invoke: invoke(archiveNote, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = GONE
              },
            },
          ],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
    restoring: {
      invoke: invoke(restoreNote, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = GONE
              },
            },
          ],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
    sharing: {
      invoke: invoke(shareNote, {
        input: { id: ctx.target, to: ctx.shareTo },
        done: 'idle',
        failed: {
          Self: {
            target: 'idle',
            assign: () => {
              ctx.error = SELF_SHARE
            },
          },
          NotFound: {
            target: 'idle',
            assign: () => {
              ctx.error = GONE
            },
          },
          Invalid: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
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
    unsharing: {
      invoke: invoke(unshareNote, {
        input: { id: ctx.target, to: ctx.shareTo },
        done: 'idle',
        failed: {
          NotFound: {
            target: 'idle',
            assign: () => {
              ctx.error = GONE
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
    undoing: {
      invoke: invoke(undoDelete, {
        input: {},
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = GONE
              },
            },
          ],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
    pinning: {
      invoke: invoke(togglePin, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [
            {
              target: 'idle',
              assign: () => {
                ctx.error = GONE
              },
            },
          ],
          Unexpected: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.error = e.message
              },
            },
          ],
        },
      }),
    },
  }),
})
