import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const cliVersion = (): string => {
  const pkg = new URL('../package.json', import.meta.url)
  return (JSON.parse(readFileSync(fileURLToPath(pkg), 'utf8')) as { version: string }).version
}

export function installedCore(config: string): string | null {
  let d = dirname(config)
  for (;;) {
    const pkg = join(d, 'node_modules/@hozu/core/package.json')
    if (existsSync(pkg)) return (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version
    const up = dirname(d)
    if (up === d) return null
    d = up
  }
}

/** Orders `x.y.z[-pre]` versions: by their numbers, then a pre-release before the release. */
export const compareVersion = (a: string, b: string): number => {
  const [an = '', ap] = a.split(/-(.*)/)
  const [bn = '', bp] = b.split(/-(.*)/)
  const [x, y] = [an.split('.').map(Number), bn.split('.').map(Number)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  if (ap === bp) return 0
  if (ap === undefined) return 1
  if (bp === undefined) return -1
  return ap.localeCompare(bp, 'en', { numeric: true })
}

/** The install command of the package manager whose lockfile the app has. */
export const installCommand = (dir: string): string =>
  existsSync(join(dir, 'pnpm-lock.yaml'))
    ? 'pnpm install'
    : existsSync(join(dir, 'yarn.lock'))
      ? 'yarn install'
      : 'npm install'
