import { dirname } from 'node:path'
import type { Loaded } from '../load.ts'
import { importer } from './app.ts'

export async function runDev(loaded: Loaded, devtools: boolean, log: (line: string) => void): Promise<void> {
  const { dev } = await importer(loaded, 'dev')<{
    dev(o: { cwd: string; port: number; devtools: boolean }): Promise<{ url: string }>
  }>('@hozu/dev', ['npm install -D @hozu/dev'])
  const { url } = await dev({ cwd: dirname(loaded.path), port: Number(process.env.PORT ?? 3000), devtools })
  log(`Hozu dev on ${url}${devtools ? ' · DevTools: choose Select in the dock (Alt+Shift+S)' : ''}`)
}
