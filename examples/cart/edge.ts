import { buildProject, type Manifest } from '@hozu/core/ir'
import { createHandler, type RenderModule } from '@hozu/runtime-server'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

const user = (cookie: string | null) => /(?:^|;\s*)user=([^;]+)/.exec(cookie ?? '')?.[1] ?? 'guest'

export function createEdge(
  manifest: Manifest,
  render: RenderModule,
  env: Record<string, string | undefined> = {},
) {
  const handler = createHandler({
    build: buildProject(project, { sources: false, manifest }),
    manifest,
    render,
    env,
    resolvers: createResolvers(),
    session: (request) => ({ userId: user(request.headers.get('cookie')) }),
  })
  return { fetch: handler.fetch }
}
