import { createServer } from '@hozu/adapter-node'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import { sessionCookie } from '@hozu/runtime-server'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

const port = Number(process.env.PORT ?? 3000)
const build = buildProject(project, { sources: false })

createServer({
  build,
  styles: await compileStyles(build),
  resolvers: createResolvers(),
  session: sessionCookie({
    name: 'sid',
    secret: process.env.SESSION_SECRET ?? 'notes-example-secret-change-me-please',
    secure: false,
  }),
}).listen(port, () => console.log(`Notes on http://localhost:${port}`))
