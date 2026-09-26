import { createServer } from '@hozu/adapter-node'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import { ogImage, optimizeImages } from '@hozu/image'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

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
}).listen(port, () => console.log(`Hozu blog on http://localhost:${port}`))
