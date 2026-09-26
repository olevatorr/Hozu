import { createServer } from '@tenonkit/adapter-node'
import { buildProject } from '@tenonkit/core/ir'
import { compileStyles } from '@tenonkit/css'
import { createResolvers } from './server.ts'
import project from './tenon.config.ts'

const port = Number(process.env.PORT ?? 3000)
const build = buildProject(project, { sources: false })

createServer({
  build,
  styles: await compileStyles(build),
  resolvers: createResolvers(),
}).listen(port, () => console.log(`Bookmarks on http://localhost:${port}`))
