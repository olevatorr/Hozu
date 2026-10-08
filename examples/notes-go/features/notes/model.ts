import { endpoint, event, fn, invoke, machine, mutation, on, query, tag } from '@hozu/core'
import { z } from 'zod'

export const Note = z
  .object({ id: z.string(), text: z.string(), pinned: z.boolean() })
  .meta({ title: 'Note' })
const Notes = z.array(Note)
const NoteKey = z.object({ id: z.string() })
const NewNote = z.object({
  text: z.string().min(1, 'Write something').max(100, 'Use at most 100 characters'),
})

export const Draft = event({ payload: z.object({ text: z.string() }) })
export const Add = event({ payload: z.object({ text: z.string() }) })
export const Remove = event({ payload: NoteKey })
export const Pin = event({ payload: NoteKey })
export const Search = event({ payload: z.object({ query: z.string() }) })
export const Select = event({ payload: z.object({ id: z.string(), checked: z.boolean() }) })
export const Bulk = event({
  payload: z.object({ ids: z.array(z.string()), action: z.enum(['delete', 'pin']) }),
})

export const notesTag = tag({ param: null })

export const notesApi = endpoint({
  method: 'GET',
  path: '/api/notes',
  input: z.object({}),
  output: z.object({ signedIn: z.boolean(), notes: z.array(Note) }),
})

export const listNotes = query({
  input: z.object({}),
  output: Notes,
  scope: 'user',
  freshness: 'request',
  tags: () => [notesTag()],
  runs: 'server',
  access: 'signedIn',
})

export const addNote = mutation({
  input: NewNote,
  output: Note,
  errors: { Duplicate: z.object({ text: z.string() }) },
  invalidates: () => [notesTag()],
  runs: 'server',
  access: 'signedIn',
})

export const removeNote = mutation({
  input: NoteKey,
  output: NoteKey,
  errors: { NotFound: NoteKey },
  invalidates: () => [notesTag()],
  runs: 'server',
  access: 'signedIn',
})

export const togglePin = mutation({
  input: NoteKey,
  output: Note,
  errors: { NotFound: NoteKey },
  invalidates: () => [notesTag()],
  runs: 'server',
  access: 'signedIn',
})

const NoteIds = z.object({ ids: z.array(z.string()).min(1, 'Select at least one note') })
const Count = z.object({ count: z.number() })

export const removeNotes = mutation({
  input: NoteIds,
  output: Count,
  invalidates: () => [notesTag()],
  runs: 'server',
  access: 'signedIn',
})

export const pinNotes = mutation({
  input: NoteIds,
  output: Count,
  invalidates: () => [notesTag()],
  runs: 'server',
  access: 'signedIn',
})

const Visible = z.object({ items: Notes, query: z.string() })

export const visible = fn({
  input: Visible,
  output: Notes,
  impl: ({ items, query }) => items.filter((n) => n.text.toLowerCase().includes(query.trim().toLowerCase())),
})

export const noMatch = fn({
  input: Visible,
  output: z.boolean(),
  impl: ({ items, query }) => !items.some((n) => n.text.toLowerCase().includes(query.trim().toLowerCase())),
})

export const total = fn({
  input: z.object({ items: Notes }),
  output: z.number(),
  impl: ({ items }) => items.length,
})

export const DUPLICATE = 'You already have this note'
export const GONE = 'This note no longer exists'

export const notesMachine = machine({
  context: z.object({
    draft: z.string(),
    query: z.string(),
    target: z.string(),
    error: z.string().nullable(),
    fields: z.object({ text: z.string().nullable() }),
    selected: z.array(z.string()),
    busy: z.boolean(),
  }),
  initialContext: {
    draft: '',
    query: '',
    target: '',
    error: null,
    fields: { text: null },
    selected: [],
    busy: false,
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
            ctx.draft = e.text
            ctx.error = null
            ctx.fields = { text: null }
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
        on(Search, {
          target: 'idle',
          assign: (e) => {
            ctx.query = e.query
          },
        }),
        on(Select, {
          target: 'idle',
          guard: (e) => e.checked === true,
          assign: (e) => {
            ctx.selected.push(e.id)
          },
        }),
        on(Select, {
          target: 'idle',
          assign: (e) => {
            ctx.selected = ctx.selected.filter((id) => id !== e.id)
          },
        }),
        on(Bulk, {
          target: 'removingMany',
          guard: (e) => e.action === 'delete',
          assign: (e) => {
            ctx.selected = e.ids
            ctx.busy = true
            ctx.error = null
          },
        }),
        on(Bulk, {
          target: 'pinningMany',
          assign: (e) => {
            ctx.selected = e.ids
            ctx.busy = true
            ctx.error = null
          },
        }),
      ],
    },
    removingMany: {
      invoke: invoke(removeNotes, {
        input: { ids: ctx.selected },
        done: {
          target: 'idle',
          assign: () => {
            ctx.selected = []
            ctx.busy = false
          },
        },
        failed: {
          Invalid: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.fields.ids
              ctx.busy = false
            },
          },
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
              ctx.busy = false
            },
          },
        },
      }),
    },
    pinningMany: {
      invoke: invoke(pinNotes, {
        input: { ids: ctx.selected },
        done: {
          target: 'idle',
          assign: () => {
            ctx.selected = []
            ctx.busy = false
          },
        },
        failed: {
          Invalid: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.fields.ids
              ctx.busy = false
            },
          },
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
              ctx.busy = false
            },
          },
        },
      }),
    },
    adding: {
      invoke: invoke(addNote, {
        input: { text: ctx.draft },
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
          Invalid: [
            {
              target: 'idle',
              assign: (e) => {
                ctx.fields = e.fields
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
