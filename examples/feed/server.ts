import { resolvers } from '@tenon/data'
import { byTag, byYear, listPage, listTags, listYears } from './features/feed/effects.ts'
import project from './tenon.config.ts'

const TAGS = [['tech', 'web'], ['tech', 'ai'], ['life'], ['tech', 'web', 'css']]
const PAGE = 10

export function createResolvers() {
  const items = Array.from({ length: 60 }, (_, i) => {
    const tags = TAGS[i % TAGS.length]!
    return {
      id: `i${i + 1}`,
      title: `Item ${i + 1}`,
      tags,
      label: tags.join('/'),
      year: String(2024 + (i % 3)),
    }
  })
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
  return resolvers(project, (implement) => [
    implement(listPage, ({ cursor }) => {
      const start = cursor ? Number(cursor.slice(1)) : 0
      const next = start + PAGE < items.length ? `c${start + PAGE}` : null
      return { items: items.slice(start, start + PAGE), next }
    }),
    implement(byTag, ({ path }) => items.filter((i) => same(i.tags.slice(0, path.length), path))),
    implement(byYear, ({ year }) => items.filter((i) => year === null || i.year === year)),
    implement(listTags, () => TAGS.map((path) => ({ path }))),
    implement(listYears, () => [{ year: null }, { year: '2024' }, { year: '2025' }, { year: '2026' }]),
  ])
}
