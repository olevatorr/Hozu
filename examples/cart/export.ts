import { exportStatic } from '@tenon/adapter-static'
import { buildProject } from '@tenon/core/ir'
import { compileStyles } from '@tenon/css'
import { createResolvers } from './server.ts'
import project from './tenon.config.ts'

const build = buildProject(project, { sources: false })
const result = await exportStatic({
  build,
  styles: await compileStyles(build),
  resolvers: createResolvers(),
  outDir: 'dist-static',
})
for (const file of result.written) console.log(`wrote   ${file}`)
for (const { route, reason } of result.skipped) console.log(`skipped ${route}: ${reason}`)
