import { resolvers } from '@hozu/data'
import project from './hozu.config.ts'

export function createResolvers() {
  return resolvers(project, () => [])
}
