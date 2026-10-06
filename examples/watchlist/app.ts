import { bundleComponents } from '@hozu/bundle'
import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import { quotes } from './features/watchlist/model.ts'
import project from './hozu.config.ts'

let demoReads = 0
const demoQuote = (symbol: string, read: number) => {
  const seed = [...symbol].reduce((n, c) => n + c.charCodeAt(0), 0)
  const base = 50 + (seed % 400)
  const change = Math.round(Math.sin(seed + read) * base) / 100
  return { symbol, price: Math.round((base + change) * 100) / 100, change }
}

export default app({
  resolvers: resolvers(project, (implement) => [
    implement(quotes, ({ symbols }) => {
      demoReads += 1
      return symbols.map((s) => demoQuote(s, demoReads))
    }),
  ]),
  components: bundleComponents,
})
