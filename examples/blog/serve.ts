import { createServer } from '@tenonkit/adapter-node'
import { buildProject } from '@tenonkit/core/ir'
import { compileStyles } from '@tenonkit/css'
import { ogImage, optimizeImages } from '@tenonkit/image'
import { createResolvers } from './server.ts'
import project from './tenon.config.ts'

const port = Number(process.env.PORT ?? 3000)
const user = (cookie: string | undefined) => /(?:^|;\s*)user=([^;]+)/.exec(cookie ?? '')?.[1] ?? 'guest'
const build = buildProject(project, { sources: false })

createServer({
  build,
  styles: await compileStyles(build),
  images: await optimizeImages(build),
  og: ogImage,
  resolvers: createResolvers(),
  session: (request) => ({ userId: user(request.headers.get('cookie') ?? undefined) }),
}).listen(port, () => console.log(`Tenon blog on http://localhost:${port}`))
