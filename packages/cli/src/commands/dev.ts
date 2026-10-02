import { dirname } from 'node:path'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { importer } from './app.ts'

type Mode = 'builder' | 'developer'

export async function runDev(
  loaded: Loaded,
  devtools: string | false,
  log: (line: string) => void,
): Promise<void> {
  if (devtools !== false && devtools !== 'builder' && devtools !== 'developer')
    throw new HozuCliError('usage', `--devtools takes builder or developer, not "${devtools}"`, [
      'hozu dev --devtools developer',
      'hozu dev --no-devtools',
    ])
  const { dev } = await importer(loaded, 'dev')<{
    dev(o: { cwd: string; port: number; devtools: boolean; devtoolsMode?: Mode }): Promise<{ url: string }>
  }>('@hozu/dev', ['npm install -D @hozu/dev'])
  const { url } = await dev({
    cwd: dirname(loaded.path),
    port: Number(process.env.PORT ?? 3000),
    devtools: devtools !== false,
    ...(devtools ? { devtoolsMode: devtools } : {}),
  })
  log(`Hozu dev on ${url}${devtools ? ' · DevTools: choose Select in the dock (Alt+Shift+S)' : ''}`)
}
