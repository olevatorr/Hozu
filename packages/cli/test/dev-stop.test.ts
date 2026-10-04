import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const notes = `${root}examples/notes`
const bin = `${root}packages/cli/bin/hozu.js`

const freePair = async (): Promise<number> => {
  for (;;) {
    const port = 20000 + Math.floor(Math.random() * 20000)
    const free = await Promise.all(
      [port, port + 1].map(
        (p) =>
          new Promise<boolean>((resolve) => {
            const s = createServer()
              .once('error', () => resolve(false))
              .listen(p, '127.0.0.1', () => s.close(() => resolve(true)))
          }),
      ),
    )
    if (free.every(Boolean)) return port
  }
}

const listening = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = createServer()
      .once('error', () => resolve(true))
      .listen(port, '127.0.0.1', () => s.close(() => resolve(false)))
  })

const settled = async (port: number, want: boolean) => {
  for (let i = 0; i < 60; i++) {
    if ((await listening(port)) === want) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

describe('hozu dev stops its app (0.17)', () => {
  for (const signal of ['SIGTERM', 'SIGKILL'] as const)
    it(`${signal} on hozu dev leaves no app process on its second port`, async () => {
      const port = await freePair()
      const child = spawn(process.execPath, [bin, 'dev', '--no-devtools'], {
        cwd: notes,
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      try {
        expect(await settled(port + 1, true)).toBe(true)
        child.kill(signal)
        expect(await settled(port + 1, false)).toBe(true)
        expect(await settled(port, false)).toBe(true)
      } finally {
        child.kill('SIGKILL')
      }
    }, 30_000)
})
