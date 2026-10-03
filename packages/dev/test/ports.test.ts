import { createServer } from 'node:net'
import { dev, PortInUse } from '@hozu/dev'
import { describe, expect, it } from 'vitest'

describe('hozu dev ports', () => {
  it('refuses to start when its port or the app port is taken, before starting anything', async () => {
    const held = createServer().listen(0, '127.0.0.1')
    await new Promise((r) => held.once('listening', r))
    const { port } = held.address() as { port: number }
    try {
      const started = dev({ cwd: '/nonexistent', port, appPort: port + 1, log: () => {} })
      await expect(started).rejects.toBeInstanceOf(PortInUse)
      await expect(started).rejects.toThrow(`Port ${port} is in use; hozu dev needs ${port} and ${port + 1}`)
    } finally {
      held.close()
    }
  })
})
