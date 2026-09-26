import { createServer } from '@hozu/adapter-node'
import { bundleWidgets } from '@hozu/bundle'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

const port = Number(process.env.PORT ?? 3000)
const build = buildProject(project, { sources: false })
const widgets = await bundleWidgets(build)
for (const d of widgets.diagnostics) console.error(`${d.code} ${d.message}`)

createServer({
  build,
  styles: await compileStyles(build),
  widgets,
  resolvers: createResolvers(),
}).listen(port, () => console.log(`Hozu showcase on http://localhost:${port}`))
