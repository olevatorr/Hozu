import { resolvers } from '@tenonkit/data'
import { addBookmark, getBookmark, listBookmarks, toggleRead } from './features/bookmarks/model.ts'
import project from './tenon.config.ts'

type Kind = 'article' | 'video' | 'podcast'

export function createResolvers() {
  const items = [
    { id: 'b1', title: 'Closed-world UI', kind: 'article' as Kind, read: false },
    { id: 'b2', title: 'Islands explained', kind: 'video' as Kind, read: true },
  ]
  let seq = items.length
  return resolvers(project, (implement) => [
    implement(listBookmarks, () => items.map((b) => ({ ...b }))),
    implement(getBookmark, ({ id }, { fail }) => {
      const b = items.find((x) => x.id === id)
      return b ? { ...b } : fail('NotFound', { id })
    }),
    implement(addBookmark, ({ title, kind }, { fail }) => {
      const clean = title.trim()
      if (items.some((b) => b.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      const b = { id: `b${++seq}`, title: clean, kind, read: false }
      items.unshift(b)
      return { ...b }
    }),
    implement(toggleRead, ({ id }, { fail }) => {
      const b = items.find((x) => x.id === id)
      if (!b) return fail('NotFound', { id })
      b.read = !b.read
      return { ...b }
    }),
  ])
}
