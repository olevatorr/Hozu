import { resolvers } from '@tenon/data'
import project from './tenon.config.ts'

export function createResolvers() {
  return resolvers(project, () => [])
}
