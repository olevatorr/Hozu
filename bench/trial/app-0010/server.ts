import { resolvers } from '@hozu/data'
import { tasksResolvers } from './features/tasks/server.ts'
import project from './hozu.config.ts'

export function createResolvers() {
  return resolvers(project, (implement) => [...tasksResolvers(implement)])
}
