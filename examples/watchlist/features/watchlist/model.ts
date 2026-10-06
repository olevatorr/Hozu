import { contract, event, invoke, machine, mutation, on, query, tag } from '@hozu/core'
import { z } from 'zod'

export const Ticker = z.string().regex(/^[A-Z]{1,5}$/, 'Use 1 to 5 capital letters')
export const Quote = z.object({ symbol: z.string(), price: z.number(), change: z.number() })

export const Add = event({ payload: z.object({ symbol: z.string() }) })
export const Remove = event({ payload: z.object({ symbol: z.string() }) })
export const Pause = event({ payload: z.object({}) })
export const Resume = event({ payload: z.object({}) })
export const RefreshNow = event({ payload: z.object({}) })
export const CopyQuote = event({ payload: z.object({ text: z.string() }) })

export const listTag = tag({ param: null })
export const quotesTag = tag({ param: null })

export const myList = query({
  input: z.object({}),
  output: z.array(z.string()),
  scope: 'user',
  freshness: 'request',
  tags: () => [listTag()],
  runs: 'browser',
})
export const addSymbol = mutation({
  input: z.object({ symbol: Ticker }),
  output: z.object({}),
  errors: { Duplicate: z.object({ symbol: z.string() }) },
  invalidates: () => [listTag()],
  runs: 'browser',
})
export const removeSymbol = mutation({
  input: z.object({ symbol: z.string() }),
  output: z.object({}),
  invalidates: () => [listTag()],
  runs: 'browser',
})
export const quotes = query({
  input: z.object({ symbols: z.array(z.string()) }),
  output: z.array(Quote),
  scope: 'public',
  freshness: 'request',
  tags: () => [quotesTag()],
  runs: 'server',
})

export const listMachine = machine({
  context: z.object({ symbol: z.string(), error: z.string().nullable() }),
  initialContext: { symbol: '', error: null },
  initial: 'live',
  on: ({ ctx }) => [
    on(Add, {
      target: 'adding',
      assign: (e) => {
        ctx.symbol = e.symbol
        ctx.error = null
      },
    }),
    on(Remove, {
      target: 'removing',
      assign: (e) => {
        ctx.symbol = e.symbol
      },
    }),
    on(RefreshNow, { refresh: () => [quotesTag()] }),
    on(CopyQuote, { copy: (e) => e.text }),
  ],
  states: ({ ctx }) => ({
    live: {
      on: [on(Pause, { target: 'paused' })],
      after: [{ ms: 30_000, target: 'live', refresh: () => [quotesTag()] }],
    },
    paused: { on: [on(Resume, { target: 'live', refresh: () => [quotesTag()] })] },
    adding: {
      invoke: invoke(addSymbol, {
        input: { symbol: ctx.symbol },
        done: 'previous',
        failed: {
          Duplicate: {
            target: 'previous',
            assign: (e) => {
              ctx.error = `${e.symbol} is already on your list`
            },
          },
          Invalid: {
            target: 'previous',
            assign: (e) => {
              ctx.error = e.message
            },
          },
          Unexpected: {
            target: 'previous',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
    removing: {
      invoke: invoke(removeSymbol, {
        input: { symbol: ctx.symbol },
        done: 'previous',
        failed: {
          Unexpected: {
            target: 'previous',
            assign: (e) => {
              ctx.error = e.message
            },
          },
        },
      }),
    },
  }),
})

export const duplicateSays = contract(listMachine, {
  given: { state: 'adding', previous: 'paused', context: { symbol: 'AAPL' } },
  when: [{ failed: addSymbol, error: 'Duplicate', data: { symbol: 'AAPL' } }],
  expect: { state: 'paused', changes: { error: 'AAPL is already on your list' } },
})
