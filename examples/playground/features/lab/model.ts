import { endpoint, event, invoke, machine, mutation, on, query, tag } from '@hozu/core'
import { z } from 'zod'
import { User } from '../../routes.ts'

const Note = z.object({ id: z.string(), text: z.string() })
export const Person = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  company: z.object({ name: z.string() }),
})
const Post = z.object({ id: z.number(), userId: z.number(), title: z.string() })
const Draft = z.object({ id: z.string(), text: z.string(), at: z.string() })
const Unavailable = z.object({ status: z.number() })

export const AddNote = event({ payload: z.object({ text: z.string() }) })
export const CreatePost = event({ payload: z.object({ title: z.string() }) })
export const SaveDraft = event({ payload: z.object({ text: z.string() }) })
export const ClearDrafts = event({ payload: z.object({}) })

export const notesTag = tag({ param: null })
export const postsTag = tag({ param: User })
export const draftsTag = tag({ param: null })

export const listNotes = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'public',
  freshness: 'static',
  tags: () => [notesTag()],
  runs: 'server',
})
export const addNote = mutation({
  input: z.object({ text: z.string().min(1, 'Write something') }),
  output: Note,
  invalidates: () => [notesTag()],
  runs: 'server',
})
export const notesApi = endpoint({
  method: 'GET',
  path: '/api/notes',
  input: z.object({}),
  output: z.array(Note),
})
export const postNoteApi = endpoint({
  method: 'POST',
  path: '/api/notes',
  input: z.object({ text: z.string().min(1, 'Write something') }),
  output: Note,
  errors: { Unauthorized: z.object({}) },
  failed: { Unauthorized: 401 },
  invalidates: () => [notesTag()],
})
export const person = query({
  input: z.object({ id: User }),
  output: Person,
  errors: { NotFound: z.object({ id: User }), Unavailable },
  scope: 'public',
  freshness: { revalidate: 60 },
  runs: 'server',
})

export const posts = query({
  input: z.object({ userId: User }),
  output: z.array(Post),
  errors: { Unavailable },
  scope: 'public',
  freshness: 'request',
  tags: (i) => [postsTag(i.userId)],
})
export const createPost = mutation({
  input: z.object({ userId: User, title: z.string().min(1, 'Give it a title') }),
  output: Post,
  errors: { Unavailable },
  invalidates: (i) => [postsTag(i.userId)],
})

export const drafts = query({
  input: z.object({}),
  output: z.array(Draft),
  scope: 'user',
  freshness: 'request',
  tags: () => [draftsTag()],
  runs: 'browser',
})
export const saveDraft = mutation({
  input: z.object({ text: z.string().min(1, 'Write something') }),
  output: Draft,
  invalidates: () => [draftsTag()],
  runs: 'browser',
})
export const clearDrafts = mutation({
  input: z.object({}),
  output: z.object({ removed: z.number() }),
  invalidates: () => [draftsTag()],
  runs: 'browser',
})

export const labMachine = machine({
  context: z.object({
    user: User,
    note: z.string(),
    title: z.string(),
    draft: z.string(),
    error: z.string().nullable(),
  }),
  initialContext: { user: '1', note: '', title: '', draft: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(AddNote, {
          target: 'addingNote',
          assign: (e) => {
            ctx.note = e.text
            ctx.error = null
          },
        }),
        on(CreatePost, {
          target: 'creatingPost',
          assign: (e) => {
            ctx.title = e.title
            ctx.error = null
          },
        }),
        on(SaveDraft, {
          target: 'savingDraft',
          assign: (e) => {
            ctx.draft = e.text
            ctx.error = null
          },
        }),
        on(ClearDrafts, { target: 'clearingDrafts' }),
      ],
    },
    addingNote: {
      invoke: invoke(addNote, {
        input: { text: ctx.note },
        done: {
          target: 'idle',
          assign: () => {
            ctx.note = ''
          },
        },
        failed: {
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
    creatingPost: {
      invoke: invoke(createPost, {
        input: { userId: ctx.user, title: ctx.title },
        done: {
          target: 'idle',
          assign: () => {
            ctx.title = ''
          },
        },
        failed: {
          Unavailable: {
            target: 'idle',
            assign: () => {
              ctx.error = 'The posts API is unavailable'
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
    savingDraft: {
      invoke: invoke(saveDraft, {
        input: { text: ctx.draft },
        done: {
          target: 'idle',
          assign: () => {
            ctx.draft = ''
          },
        },
        failed: {
          Unexpected: {
            target: 'idle',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
    clearingDrafts: {
      invoke: invoke(clearDrafts, {
        input: {},
        done: 'idle',
        failed: {
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
