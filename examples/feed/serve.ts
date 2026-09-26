import { createServer } from '@tenon/adapter-node'
import { buildProject } from '@tenon/core/ir'
import { compileStyles } from '@tenon/css'
import { createResolvers } from './server.ts'
import project from './tenon.config.ts'

const port = Number(process.env.PORT ?? 3000)
const build = buildProject(project, { sources: false })

createServer({
  build,
  styles: await compileStyles(build),
  resolvers: createResolvers(),
}).listen(port, () => console.log(`Feed on http://localhost:${port}`))
