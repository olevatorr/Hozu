import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import project, { now } from './hozu.config.ts'
import { read } from './server/db.ts'

export default app({ resolvers: resolvers(project, (implement) => [implement(now, () => read())]) })
