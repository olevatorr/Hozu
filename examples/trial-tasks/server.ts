import { resolvers } from '@tenon/data'
import project from './tenon.config.ts'

export const createResolvers = () => resolvers(project, () => [])
