import { register } from 'node:module'
import { MessageChannel } from 'node:worker_threads'

const { port1, port2 } = new MessageChannel()
port1.on('message', (files: string[]) => process.send?.({ hozuGraph: files }))
port1.unref()
register(import.meta.url.endsWith('.ts') ? './graph-hook.ts' : './graph-hook.js', import.meta.url, {
  data: { port: port2 },
  transferList: [port2],
})
