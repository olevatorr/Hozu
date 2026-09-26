import { resolvers } from '@tenonkit/data'
import project from './tenon.config.ts'

export function createResolvers() {
  return resolvers(project, () => [])
}
