import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { DevtoolsMessagesOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'

interface DevtoolsModule {
  devtoolsMessages: Record<string, string>
  messagesOf(json: unknown): Record<string, string>
  checkMessages(messages: Record<string, string>): {
    missing: string[]
    unknown: string[]
    placeholders: string[]
  }
}

const version = (): string =>
  (
    JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as {
      version: string
    }
  ).version

/** `@hozu/devtools` as the app has it: directly, or through `@hozu/dev` (pnpm does not hoist it). */
async function devtoolsOf(loaded: Loaded): Promise<DevtoolsModule> {
  const app = createRequire(loaded.path)
  const where = [
    () => app.resolve('@hozu/devtools'),
    () => createRequire(app.resolve('@hozu/dev')).resolve('@hozu/devtools'),
  ]
  for (const resolveIt of where) {
    try {
      return (await import(pathToFileURL(resolveIt()).href)) as DevtoolsModule
    } catch {}
  }
  throw new HozuCliError('usage', 'hozu devtools needs @hozu/dev in the app', ['npm install -D @hozu/dev'])
}

/**
 * The file named by --devtools-messages, else HOZU_DEVTOOLS_MESSAGES, else none (English) (ADR 0060 D). A missing
 * file named by the flag is an error; one named by the variable, set for every project, is a warning.
 */
export function messagesFileOf(
  flag: string | undefined,
  cwd: string,
  warn: (line: string) => void = () => {},
): string | null {
  const named = flag ?? process.env.HOZU_DEVTOOLS_MESSAGES
  if (!named) return null
  const file = resolve(cwd, named.replace(/^~(?=\/)/, process.env.HOME ?? '~'))
  if (existsSync(file)) return file
  if (!flag) {
    warn(`HOZU_DEVTOOLS_MESSAGES names ${file}, which does not exist: DevTools stays in English`)
    return null
  }
  throw new HozuCliError('usage', `The DevTools messages file ${file} does not exist`, [
    'npx hozu devtools messages > devtools.messages.json   # every string, to translate',
  ])
}

const read = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new HozuCliError('usage', `${file} is not JSON: ${(error as Error).message}`, [
      'npx hozu devtools messages > devtools.messages.json',
    ])
  }
}

/** `hozu devtools messages [--check <file>]`: every DevTools string to translate, or what a translation lacks. */
export async function runDevtoolsMessages(
  loaded: Loaded,
  check: string | undefined,
  cwd: string,
): Promise<DevtoolsMessagesOutput> {
  const devtools = await devtoolsOf(loaded)
  if (!check) return { hozu: version(), messages: devtools.devtoolsMessages }
  const file = resolve(cwd, check)
  if (!existsSync(file)) throw new HozuCliError('usage', `${file} does not exist`, [])
  const result = devtools.checkMessages(devtools.messagesOf(read(file)))
  return { file: check, ...result }
}

export function describeDevtoolsMessages(r: DevtoolsMessagesOutput): string {
  if ('messages' in r) return `${JSON.stringify({ hozu: r.hozu, messages: r.messages }, null, 2)}\n`
  const lines = [
    r.missing.length || r.unknown.length || r.placeholders.length
      ? `${r.file}: ${r.missing.length} missing (shown in English), ${r.unknown.length} unknown, ${r.placeholders.length} with other placeholders`
      : `✔ ${r.file} translates every DevTools string`,
  ]
  for (const k of r.missing) lines.push(`  missing      ${k}`)
  for (const k of r.unknown) lines.push(`  unknown      ${k}   (DevTools no longer has it)`)
  for (const k of r.placeholders)
    lines.push(`  placeholders ${k}   (use the same {names} as the English text)`)
  return `${lines.join('\n')}\n`
}

/** One line for `hozu dev`: which translation it uses and what it lacks. */
export async function messagesLine(loaded: Loaded, file: string | null): Promise<string | null> {
  if (!file) return null
  const devtools = await devtoolsOf(loaded)
  const { missing, unknown, placeholders } = devtools.checkMessages(devtools.messagesOf(read(file)))
  const gaps = [
    missing.length ? `${missing.length} missing (shown in English)` : '',
    unknown.length ? `${unknown.length} unknown` : '',
    placeholders.length ? `${placeholders.length} with other placeholders` : '',
  ].filter(Boolean)
  return `DevTools messages: ${file}${gaps.length ? ` · ${gaps.join(', ')} · npx hozu devtools messages --check ${file}` : ''}`
}
