import { bundleComponents } from '@hozu/bundle'
import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import { quotes } from './features/watchlist/model.ts'
import project from './hozu.config.ts'

const demoQuote = (symbol: string, at: number) => {
  const seed = [...symbol].reduce((n, c) => n + c.charCodeAt(0), 0)
  const base = 50 + (seed % 400)
  const change = Math.round(Math.sin(seed + at / 30_000) * base) / 100
  return { symbol, price: Math.round((base + change) * 100) / 100, change }
}

export default app({
  resolvers: resolvers(project, (implement) => [
    implement(quotes, ({ symbols }) => symbols.map((s) => demoQuote(s, Date.now()))),
  ]),
  components: bundleComponents,
})
