import { createServer } from '@tenon/adapter-node'
import { bundleWidgets } from '@tenon/bundle'
import { buildProject } from '@tenon/core/ir'
import { compileStyles } from '@tenon/css'
import { createResolvers } from './server.ts'
import project from './tenon.config.ts'

const port = Number(process.env.PORT ?? 3000)
const build = buildProject(project, { sources: false })
const widgets = await bundleWidgets(build)
for (const d of widgets.diagnostics) console.error(`${d.code} ${d.message}`)

createServer({
  build,
  styles: await compileStyles(build),
  widgets,
  resolvers: createResolvers(),
}).listen(port, () => console.log(`Tenon showcase on http://localhost:${port}`))
