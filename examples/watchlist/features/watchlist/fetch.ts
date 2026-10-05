import { implement } from '@hozu/core/fetch'
import type * as model from './model.ts'

const KEY = 'watchlist:symbols'

const read = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export const myList = implement<typeof model.myList>(async () => read())

export const addSymbol = implement<typeof model.addSymbol>(async ({ symbol }, { fail }) => {
  const list = read()
  if (list.includes(symbol)) return fail('Duplicate', { symbol })
  localStorage.setItem(KEY, JSON.stringify([...list, symbol]))
  return {}
})

export const removeSymbol = implement<typeof model.removeSymbol>(async ({ symbol }) => {
  localStorage.setItem(KEY, JSON.stringify(read().filter((s) => s !== symbol)))
  return {}
})
