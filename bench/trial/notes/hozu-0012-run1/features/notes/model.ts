import { event, fn, invoke, machine, mutation, on, op, query, tag, ui } from '@hozu/core'
import { z } from 'zod'
import { login } from '../../routes.ts'

export const Note = z.object({ id: z.string(), text: z.string(), pinned: z.boolean() })
export const NoteList = z.object({ count: z.number(), notes: z.array(Note) })
const NoteKey = z.object({ id: z.string() })

export const Add = event({ payload: z.object({ text: z.string() }) })
export const Delete = event({ payload: NoteKey })
export const SignOut = event({ payload: z.object({}) })
export const TogglePin = event({ payload: NoteKey })
export const Search = event({ payload: z.object({ text: z.string() }) })

export const notesTag = tag({ param: null })

export const listNotes = query({
  input: z.object({}),
  output: NoteList,
  scope: 'user',
  freshness: 'live',
  tags: () => [notesTag()],
})

export const addNote = mutation({
  input: z.object({
    text: z.string().trim().min(1, 'Write a note').max(100, 'Use at most 100 characters'),
  }),
  output: Note,
  errors: { Duplicate: z.object({ text: z.string() }) },
  invalidates: () => [notesTag()],
})

export const deleteNote = mutation({
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

const Matching = z.object({ notes: z.array(Note), text: z.string() })

export const matching = fn({
  input: Matching,
  output: z.array(Note),
  impl: ({ notes, text }) => notes.filter((n) => n.text.toLowerCase().includes(text.trim().toLowerCase())),
})

export const noMatch = fn({
  input: Matching,
  output: z.boolean(),
  impl: ({ notes, text }) => !notes.some((n) => n.text.toLowerCase().includes(text.trim().toLowerCase())),
})

export const signOut = mutation({
  input: z.object({}),
  output: z.object({}),
  invalidates: () => [notesTag()],
})

export const DUPLICATE = 'You already have this note'

export const notesMachine = machine({
  context: z.object({
    draft: z.string(),
    target: z.string(),
    search: z.string(),
    error: z.string().nullable(),
    fields: z.object({ text: z.string().nullable() }),
  }),
  initialContext: { draft: '', target: '', search: '', error: null, fields: { text: null } },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Add, {
          target: 'adding',
          assign: (e) => [
            op.set(ctx.draft, e.text),
            op.set(ctx.error, null),
            op.set(ctx.fields, { text: null }),
          ],
        }),
        on(Delete, {
          target: 'deleting',
          assign: (e) => [op.set(ctx.target, e.id), op.set(ctx.error, null)],
        }),
        on(TogglePin, {
          target: 'pinning',
          assign: (e) => [op.set(ctx.target, e.id), op.set(ctx.error, null)],
        }),
        on(Search, { target: 'idle', assign: (e) => [op.set(ctx.search, e.text)] }),
        on(SignOut, { target: 'signingOut' }),
      ],
    },
    adding: {
      ignore: [Add, Delete, TogglePin, Search, SignOut],
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
    deleting: {
      ignore: [Add, Delete, TogglePin, Search, SignOut],
      invoke: invoke(deleteNote, {
        input: { id: ctx.target },
        done: [{ target: 'idle', assign: () => [op.set(ctx.target, '')] }],
        failed: {
          NotFound: [{ target: 'idle' }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    pinning: {
      ignore: [Add, Delete, TogglePin, Search, SignOut],
      invoke: invoke(togglePin, {
        input: { id: ctx.target },
        done: [{ target: 'idle', assign: () => [op.set(ctx.target, '')] }],
        failed: {
          NotFound: [{ target: 'idle' }],
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
    signingOut: {
      ignore: [Add, Delete, TogglePin, Search, SignOut],
      invoke: invoke(signOut, {
        input: {},
        done: [{ target: 'idle', navigate: () => ui.link(login, null) }],
        failed: {
          Unexpected: [{ target: 'idle', assign: (e) => [op.set(ctx.error, e.message)] }],
        },
      }),
    },
  }),
})
