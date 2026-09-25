import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

let client: string | undefined

export const clientBundle = (): string =>
  (client ??= readFileSync(fileURLToPath(import.meta.resolve('@tenon/runtime-client/browser')), 'utf8'))
