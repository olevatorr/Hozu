import { bundleComponents } from '@hozu/bundle'
import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import project from './hozu.config.ts'

export default app({ resolvers: resolvers(project, () => []), components: bundleComponents })
