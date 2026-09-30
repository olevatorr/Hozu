import type { Manifest } from '@hozu/core/ir'
import { createHandler, type RenderModule } from '@hozu/runtime-server'
import app from './app.ts'

export function createEdge(
  manifest: Manifest,
  render: RenderModule,
  env: Record<string, string | undefined> = {},
) {
  const handler = createHandler(app, { manifest, render, env })
  return { fetch: handler.fetch }
}
