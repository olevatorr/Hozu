import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import { addBookmark, getBookmark, listBookmarks, toggleRead } from './features/bookmarks/model.ts'
import project from './hozu.config.ts'

type Kind = 'article' | 'video' | 'podcast'

const demoBookmarks = [
  { id: 'b1', title: 'Closed-world UI', kind: 'article' as Kind, read: false },
  { id: 'b2', title: 'Islands explained', kind: 'video' as Kind, read: true },
]
let demoSeq = demoBookmarks.length
export default app({
  resolvers: resolvers(project, (implement) => [
    implement(listBookmarks, () => demoBookmarks.map((b) => ({ ...b }))),
    implement(getBookmark, ({ id }, { fail }) => {
      const b = demoBookmarks.find((x) => x.id === id)
      return b ? { ...b } : fail('NotFound', { id })
    }),
    implement(addBookmark, ({ title, kind }, { fail }) => {
      const clean = title.trim()
      if (demoBookmarks.some((b) => b.title.toLowerCase() === clean.toLowerCase()))
        return fail('Duplicate', { title: clean })
      const b = { id: `b${++demoSeq}`, title: clean, kind, read: false }
      demoBookmarks.unshift(b)
      return { ...b }
    }),
    implement(toggleRead, ({ id }, { fail }) => {
      const b = demoBookmarks.find((x) => x.id === id)
      if (!b) return fail('NotFound', { id })
      b.read = !b.read
      return { ...b }
    }),
  ]),
})
