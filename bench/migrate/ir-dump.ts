import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildProject, canonicalStringify } from '@hozu/core/ir'

const [out, ...configs] = process.argv.slice(2)
mkdirSync(out!, { recursive: true })
for (const config of configs) {
  const name = config.replace(/\/hozu\.config\.ts$/, '').replaceAll('/', '-')
  const built = buildProject((await import(pathToFileURL(config).href)).default, { sources: false })
  const diagnostics = built.diagnostics.map((d) => `${d.code} ${d.location.pointer} ${d.message}`)
  writeFileSync(join(out!, `${name}.json`), canonicalStringify({ ir: built.ir, diagnostics }))
}
