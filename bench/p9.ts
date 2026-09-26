import { Agent, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer } from '@tenonkit/adapter-node'
import { buildProject } from '@tenonkit/core/ir'
import { createResolvers } from '../examples/cart/server.ts'
import project from '../examples/cart/tenon.config.ts'

const server = createServer({
  build: buildProject(project, { sources: false }),
  resolvers: createResolvers(),
  session: () => ({ userId: 'bench' }),
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const { port } = server.address() as AddressInfo
const agent = new Agent({ keepAlive: true, maxSockets: 16 })
const get = () =>
  new Promise<void>((resolve, reject) =>
    request({ host: '127.0.0.1', port, path: '/', agent }, (res) => {
      res.resume()
      res.on('end', resolve)
    })
      .on('error', reject)
      .end(),
  )
const run = async (ms: number) => {
  let count = 0
  const until = performance.now() + ms
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (performance.now() < until) {
        await get()
        count++
      }
    }),
  )
  return (count / ms) * 1000
}
await run(500)
const rounds = [await run(1000), await run(1000), await run(1000)]
agent.destroy()
server.close()
process.stdout.write(JSON.stringify(rounds))
