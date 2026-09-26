import { exportStatic } from '@hozu/adapter-static'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

const build = buildProject(project, { sources: false })
const result = await exportStatic({
  build,
  styles: await compileStyles(build),
  resolvers: createResolvers(),
  outDir: 'dist-static',
})
for (const file of result.written) console.log(`wrote   ${file}`)
for (const { route, reason } of result.skipped) console.log(`skipped ${route}: ${reason}`)
