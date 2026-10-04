import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import { products } from './data.ts'
import { listProducts } from './features/shop/model.ts'
import project from './hozu.config.ts'

export default app({
  resolvers: resolvers(project, (implement) => [implement(listProducts, () => products)]),
})
