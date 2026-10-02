import { copyFile, readdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { exportStatic } from '@hozu/adapter-static'
import { bundleComponents } from '@hozu/bundle'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import { appOptionsOf } from '@hozu/runtime-server'
import app from './app.ts'
import project from './hozu.config.ts'

const build = buildProject(project, { sources: false })
const outDir = fileURLToPath(new URL('./dist/', import.meta.url))
await rm(outDir, { recursive: true, force: true })
const result = await exportStatic({
  build,
  styles: await compileStyles(build),
  components: await bundleComponents(build),
  resolvers: appOptionsOf(app)!.resolvers,
  outDir,
})
for (const file of result.written) console.log(`wrote   ${file}`)
for (const { route, reason } of result.skipped) console.error(`skipped ${route}: ${reason}`)
for (const { path, effect, reason } of result.needsServer)
  console.error(`needs a server: ${path} calls ${effect} (${reason})`)
if (result.skipped.length || result.needsServer.length) process.exitCode = 1
else {
  await writeFile(new URL('./dist/CNAME', import.meta.url), 'hozu.org\n')
  await writeFile(new URL('./dist/.nojekyll', import.meta.url), '')
  const images = (await readdir(new URL('../docs/trials/', import.meta.url))).filter((f) =>
    f.endsWith('.svg'),
  )
  for (const image of images)
    await copyFile(
      new URL(`../docs/trials/${image}`, import.meta.url),
      new URL(`./dist/trials/${image}`, import.meta.url),
    )
  console.log(
    `Exported ${result.written.length} files; 0 skipped routes. Wrote CNAME, .nojekyll and ${images.length} trial images.`,
  )
}
