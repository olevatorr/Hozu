import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const config = process.argv[2]!
const req = createRequire(config)
const core = await import(pathToFileURL(req.resolve('@hozu/core/ir')).href)
const built = core.buildProject((await import(pathToFileURL(config).href)).default, { sources: false })
process.stdout.write(
  JSON.stringify({
    ir: built.ir,
    diagnostics: built.diagnostics.map(
      (d: { code: string; message: string; location: { pointer: string } }) =>
        `${d.code} ${d.location.pointer} ${d.message}`,
    ),
  }),
  () => process.exit(0),
)
