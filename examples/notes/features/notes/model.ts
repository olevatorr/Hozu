import { endpoint, event, fn, invoke, machine, mutation, on, op, query, tag } from '@hozu/core'
import { z } from 'zod'

export const Note = z.object({ id: z.string(), text: z.string(), pinned: z.boolean() })
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
  errors: { Unauthorized: z.object({}) },
  scope: 'user',
  freshness: 'static',
  tags: () => [notesTag()],
})

export const addNote = mutation({
  input: NewNote,
  output: Note,
  errors: { Duplicate: z.object({ text: z.string() }) },
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
  }),
  initialContext: { draft: '', query: '', target: '', error: null, fields: { text: null } },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Draft, { target: 'idle', assign: (e) => [op.set(ctx.draft, e.text)] }),
        on(Add, {
          target: 'adding',
          assign: (e) => [
            op.set(ctx.draft, e.text),
            op.set(ctx.error, null),
            op.set(ctx.fields, { text: null }),
          ],
        }),
        on(Remove, {
          target: 'removing',
          assign: (e) => [op.set(ctx.target, e.id), op.set(ctx.error, null)],
        }),
        on(Pin, { target: 'pinning', assign: (e) => [op.set(ctx.target, e.id), op.set(ctx.error, null)] }),
        on(Search, { target: 'idle', assign: (e) => [op.set(ctx.query, e.query)] }),
      ],
    },
    adding: {
      invoke: invoke(addNote, {
        input: { text: ctx.draft },
        done: [{ target: 'idle', assign: () => [op.set(ctx.draft, '')] }],
        failed: {
          Duplicate: [{ target: 'idle', assign: () => [op.set(ctx.error, DUPLICATE)] }],
          Invalid: [{ target: 'idle', assign: (e) => [op.set(ctx.fields, e.fields)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    removing: {
      invoke: invoke(removeNote, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [{ target: 'idle', assign: () => [op.set(ctx.error, GONE)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    pinning: {
      invoke: invoke(togglePin, {
        input: { id: ctx.target },
        done: [{ target: 'idle' }],
        failed: {
          NotFound: [{ target: 'idle', assign: () => [op.set(ctx.error, GONE)] }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
  }),
})
