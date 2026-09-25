import { createServer } from '@tenon/adapter-node'
import { buildProject } from '@tenon/core/ir'
import { compileStyles } from '@tenon/css'
import { createResolvers } from './server.ts'
import project from './tenon.config.ts'

const port = Number(process.env.PORT ?? 3000)
const user = (cookie: string | undefined) => /(?:^|;\s*)user=([^;]+)/.exec(cookie ?? '')?.[1] ?? 'guest'

const build = buildProject(project, { sources: false })

createServer({
  build,
  styles: await compileStyles(build),
  resolvers: createResolvers(),
  session: (request) => ({ userId: user(request.headers.cookie) }),
}).listen(port, () => console.log(`Tenon cart on http://localhost:${port}`))
