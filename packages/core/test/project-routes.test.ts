import { project, route } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const Slug = z.object({ slug: z.string() })

describe('project({ routes }) takes only routes (ADR 0069 A7)', () => {
  it('reports a value that is not a route() as HZ014 naming its key', () => {
    const routesModule = { home, Slug } as unknown as Record<string, typeof home>
    const build = buildProject(
      project({ schema: zodAdapter, routes: routesModule, pages: [], features: [] }),
      { sources: false },
    )
    const found = build.diagnostics.filter((d) => d.code === 'HZ014')
    expect(found).toHaveLength(1)
    expect(found[0]!.message).toContain('routes.Slug')
    expect(found[0]!.location.pointer).toBe('/routes/Slug')
    expect(build.ir.routes.home?.path).toBe('/')
    expect(build.ir.routes.Slug).toBeUndefined()
  })
})
