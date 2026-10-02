import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const config = process.argv[2]!
const require = createRequire(config)
const { buildProject } = (await import(pathToFileURL(require.resolve('@hozu/core/ir')).href)) as {
  buildProject: (project: unknown, options: { sources: boolean }) => { ir: unknown }
}
const project = ((await import(pathToFileURL(config).href)) as { default: unknown }).default
process.stdout.write(JSON.stringify(buildProject(project, { sources: false }).ir))
