import { dirname } from 'node:path'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { banner, bold, colorDepth, dim, red } from '../mark.ts'
import { cliVersion } from '../versions.ts'
import { importer } from './app.ts'
import { messagesLine } from './devtools.ts'

type Mode = 'builder' | 'developer'

export async function runDev(
  loaded: Loaded,
  devtools: string | false,
  log: (line: string) => void,
  messages: string | null = null,
): Promise<void> {
  if (devtools !== false && devtools !== 'builder' && devtools !== 'developer')
    throw new HozuCliError('usage', `--devtools takes builder or developer, not "${devtools}"`, [
      'hozu dev --devtools developer',
      'hozu dev --no-devtools',
    ])
  const { dev } = await importer(loaded, 'dev')<{
    dev(o: {
      cwd: string
      port: number
      devtools: boolean
      devtoolsMode?: Mode
      devtoolsMessages?: string | null
    }): Promise<{ url: string; close(): Promise<void> }>
  }>('@hozu/dev', ['npm install -D @hozu/dev'])
  const line = devtools ? await messagesLine(loaded, messages) : null
  const port = Number(process.env.PORT ?? 3000)
  const { url, close } = await dev({
    cwd: dirname(loaded.path),
    port,
    devtools: devtools !== false,
    ...(devtools ? { devtoolsMode: devtools } : {}),
    devtoolsMessages: messages,
  }).catch((error: unknown) => {
    const busy = (error as { port?: unknown }).port
    if (typeof busy !== 'number') throw error
    throw new HozuCliError('usage', (error as Error).message, [
      `PORT=${port + 10} npm run dev   # another pair of ports`,
      `lsof -ti:${busy}   # what holds port ${busy}`,
    ])
  })
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
    process.once(signal, () => void close().finally(() => process.exit(0)))
  const depth = colorDepth(process.stdout, process.env)
  for (const text of banner(
    [
      `${bold(red('Hozu', depth), depth)} ${cliVersion()} ${dim('· dev', depth)}`,
      '',
      `➜ Local:    ${url}`,
      ...(devtools ? [dim('  DevTools: choose Select in the dock (Alt+Shift+S)', depth)] : []),
      dim(`  stop: Ctrl+C or kill ${process.pid}`, depth),
    ],
    depth,
  ))
    log(text)
  if (line) log(line)
}
