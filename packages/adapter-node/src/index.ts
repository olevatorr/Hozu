import { createServer as http, type Server } from 'node:http'
import { createHandler, type NodeAdapterOptions } from './handler.ts'

export type { Handler, NodeAdapterOptions } from './handler.ts'
export { createHandler } from './handler.ts'

export function createServer(options: NodeAdapterOptions): Server & { revalidate(tags: string[]): number } {
  const handler = createHandler(options)
  return Object.assign(http(handler), { revalidate: handler.revalidate })
}
