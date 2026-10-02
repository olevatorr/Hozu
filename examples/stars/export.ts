import { exportStatic } from '@hozu/adapter-static'
import { bundleComponents } from '@hozu/bundle'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import { appOptionsOf } from '@hozu/runtime-server'
import app from './app.ts'
import project from './hozu.config.ts'

const build = buildProject(project, { sources: false })
const outDir = process.argv[2] ?? new URL('./dist', import.meta.url).pathname
const result = await exportStatic({
  build,
  styles: await compileStyles(build),
  components: await bundleComponents(build),
  resolvers: appOptionsOf(app)!.resolvers,
  outDir,
  env: process.env,
})
for (const s of result.skipped) console.log(`skipped ${s.route}: ${s.reason}`)
for (const n of result.needsServer) console.log(`needs a server: ${n.path} calls ${n.effect} (${n.reason})`)
console.log(`exported ${result.written.length} files to ${outDir}`)
if (result.needsServer.length) process.exit(1)
