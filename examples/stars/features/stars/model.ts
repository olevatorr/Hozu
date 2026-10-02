import { event, invoke, machine, mutation, on, query, tag } from '@hozu/core'
import { z } from 'zod'

export const Repo = z.object({
  id: z.number(),
  full_name: z.string(),
  description: z.string().nullable(),
  stargazers_count: z.number(),
})
const Repos = z.array(Repo)

export const Search = event({ payload: z.object({ q: z.string() }) })
export const SaveToken = event({ payload: z.object({ token: z.string() }) })
export const Star = event({ payload: z.object({ repo: z.string() }) })
export const Unstar = event({ payload: z.object({ repo: z.string() }) })

export const starredTag = tag({ param: null })

export const searchRepos = query({
  input: z.object({ q: z.string() }),
  output: Repos,
  errors: { Unavailable: z.object({ status: z.number() }) },
  scope: 'public',
  freshness: 'request',
})
export const starred = query({
  input: z.object({}),
  output: Repos,
  errors: { Unauthorized: z.object({}) },
  scope: 'user',
  freshness: 'request',
  tags: () => [starredTag()],
  runs: 'browser',
})
export const saveToken = mutation({
  input: z.object({ token: z.string().min(1, 'Paste a token') }),
  output: z.object({}),
  invalidates: () => [starredTag()],
  runs: 'browser',
})
export const star = mutation({
  input: z.object({ repo: z.string() }),
  output: z.object({}),
  errors: { Unauthorized: z.object({}) },
  invalidates: () => [starredTag()],
  runs: 'browser',
})
export const unstar = mutation({
  input: z.object({ repo: z.string() }),
  output: z.object({}),
  errors: { Unauthorized: z.object({}) },
  invalidates: () => [starredTag()],
  runs: 'browser',
})

export const starsMachine = machine({
  context: z.object({ q: z.string(), token: z.string(), repo: z.string(), error: z.string().nullable() }),
  initialContext: { q: '', token: '', repo: '', error: null },
  initial: 'idle',
  on: ({ ctx }) => [
    on(Search, {
      assign: (e) => {
        ctx.q = e.q
      },
    }),
  ],
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(SaveToken, {
          target: 'saving',
          assign: (e) => {
            ctx.token = e.token
            ctx.error = null
          },
        }),
        on(Star, {
          target: 'starring',
          assign: (e) => {
            ctx.repo = e.repo
            ctx.error = null
          },
        }),
        on(Unstar, {
          target: 'unstarring',
          assign: (e) => {
            ctx.repo = e.repo
            ctx.error = null
          },
        }),
      ],
    },
    saving: {
      invoke: invoke(saveToken, {
        input: { token: ctx.token },
        done: {
          target: 'idle',
          assign: () => {
            ctx.token = ''
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
    starring: {
      invoke: invoke(star, {
        input: { repo: ctx.repo },
        done: 'idle',
        failed: {
          Unauthorized: {
            target: 'idle',
            assign: () => {
              ctx.error = 'Paste a GitHub token first'
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
    unstarring: {
      invoke: invoke(unstar, {
        input: { repo: ctx.repo },
        done: 'idle',
        failed: {
          Unauthorized: {
            target: 'idle',
            assign: () => {
              ctx.error = 'Paste a GitHub token first'
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
  }),
})
