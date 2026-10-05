import { contract, event, invoke, machine, mutation, on, query, tag } from '@hozu/core'
import { z } from 'zod'

export const Symbol = z.string().regex(/^[A-Z]{1,5}$/, 'Use 1 to 5 capital letters')
export const Quote = z.object({ symbol: z.string(), price: z.number(), change: z.number() })

export const Add = event({ payload: z.object({ symbol: z.string() }) })
export const Remove = event({ payload: z.object({ symbol: z.string() }) })

export const listTag = tag({ param: null })

export const myList = query({
  input: z.object({}),
  output: z.array(z.string()),
  scope: 'user',
  freshness: 'request',
  tags: () => [listTag()],
  runs: 'browser',
})
export const addSymbol = mutation({
  input: z.object({ symbol: Symbol }),
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
  freshness: { poll: 30 },
  runs: 'server',
})

export const listMachine = machine({
  context: z.object({ symbol: z.string(), error: z.string().nullable() }),
  initialContext: { symbol: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
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
      ],
    },
    adding: {
      invoke: invoke(addSymbol, {
        input: { symbol: ctx.symbol },
        done: 'idle',
        failed: {
          Duplicate: {
            target: 'idle',
            assign: (e) => {
              ctx.error = `${e.symbol} is already on your list`
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
    removing: {
      invoke: invoke(removeSymbol, {
        input: { symbol: ctx.symbol },
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

export const duplicateSays = contract(listMachine, {
  given: { state: 'adding', context: { symbol: 'AAPL' } },
  when: [{ failed: addSymbol, error: 'Duplicate', data: { symbol: 'AAPL' } }],
  expect: { state: 'idle', changes: { error: 'AAPL is already on your list' } },
})
