import { createServer } from '@hozu/adapter-node'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

const port = Number(process.env.PORT ?? 3000)
const build = buildProject(project, { sources: false })

createServer({
  build,
  styles: await compileStyles(build),
  resolvers: createResolvers(),
}).listen(port, () => console.log(`__NAME__ on http://localhost:${port}`))
