import { buildProject, type Manifest } from '@tenonkit/core/ir'
import { createHandler, type RenderModule } from '@tenonkit/runtime-server'
import { createResolvers } from './server.ts'
import project from './tenon.config.ts'

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
