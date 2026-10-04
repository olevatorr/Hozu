import { hashJson } from '@hozu/core/ir'
import { files } from '@hozu/runtime-client/files'

const bundle = Object.fromEntries(Object.entries(files).map(([name, code]) => [`/_hozu/${name}`, code]))

export const clientBundle = (): Record<string, string> => bundle

let version: string | null = null
/** `/_hozu/client.js` under its content hash, so a page never runs a cached client whose chunks a deploy removed. */
export const clientUrl = (basePath = ''): string => {
  version ??= hashJson(bundle).slice(0, 12)
  return `${basePath}/_hozu/client.js?v=${version}`
}
