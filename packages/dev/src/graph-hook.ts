import { sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MessagePort } from 'node:worker_threads'

const root = process.cwd() + sep
const seen = new Set<string>()
let port: MessagePort | null = null

export function initialize(data: { port: MessagePort }) {
  port = data.port
}

export async function load(
  url: string,
  context: object,
  nextLoad: (url: string, context: object) => Promise<unknown>,
): Promise<unknown> {
  if (url.startsWith('file:')) {
    const file = fileURLToPath(url)
    if (file.startsWith(root) && !file.includes(`${sep}node_modules${sep}`) && !seen.has(file)) {
      seen.add(file)
      port?.postMessage([file])
    }
  }
  return nextLoad(url, context)
}
