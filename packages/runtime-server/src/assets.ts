import { readdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

let files: Record<string, string> | undefined

export const clientBundle = (): Record<string, string> => {
  if (files) return files
  const dir = dirname(fileURLToPath(import.meta.resolve('@tenon/runtime-client/browser/client.js')))
  files = Object.fromEntries(
    readdirSync(dir).map((name) => [`/_tenon/${name}`, readFileSync(`${dir}/${name}`, 'utf8')]),
  )
  return files
}
