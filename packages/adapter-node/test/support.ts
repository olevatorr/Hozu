import { request as http, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer, type NodeAdapterOptions } from '@tenon/adapter-node'
import { buildProject } from '@tenon/core/ir'
import { createResolvers } from '../../../examples/cart/server.ts'
import project from '../../../examples/cart/tenon.config.ts'

export const build = buildProject(project, { sources: false })

export interface Response {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

export function start(options: Partial<NodeAdapterOptions> = {}) {
  const server = createServer({
    build,
    resolvers: createResolvers(),
    session: (req) => ({ userId: req.headers.get('x-user') ?? 'guest' }),
    ...options,
  })
  const ready = new Promise<Server>((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
  const call = async (method: string, path: string, body?: unknown, user = 'ada'): Promise<Response> => {
    const { port } = (await ready).address() as AddressInfo
    return new Promise((resolve, reject) => {
      const req = http(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers: { 'x-user': user, 'content-type': 'application/json' },
        },
        (res) => {
          let text = ''
          res.on('data', (c) => {
            text += c
          })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }))
        },
      )
      req.on('error', reject)
      req.end(body === undefined ? undefined : JSON.stringify(body))
    })
  }
  return { server, call, close: async () => new Promise<void>((r) => (server as Server).close(() => r())) }
}
