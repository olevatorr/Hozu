import { files } from '@tenon/runtime-client/files'

const bundle = Object.fromEntries(Object.entries(files).map(([name, code]) => [`/_tenon/${name}`, code]))

export const clientBundle = (): Record<string, string> => bundle
