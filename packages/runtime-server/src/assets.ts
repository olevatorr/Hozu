import { files } from '@hozu/runtime-client/files'

const bundle = Object.fromEntries(Object.entries(files).map(([name, code]) => [`/_hozu/${name}`, code]))

export const clientBundle = (): Record<string, string> => bundle
