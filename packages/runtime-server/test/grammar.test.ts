import { buildProject, routePattern } from '@tenonkit/core/ir'
import { pathOf } from '@tenonkit/machine'
import { matcher } from '@tenonkit/runtime-server'
import { describe, expect, it } from 'vitest'
import project from '../../../examples/feed/tenon.config.ts'

const build = buildProject(project, { sources: false })
const match = matcher(build)

describe('route grammar (ADR 0018)', () => {
  it('matches one, optional, one-or-more and zero-or-more segments', () => {
    expect(match('/tags/tech/web')).toEqual({ route: 'tag', params: { path: ['tech', 'web'] } })
    expect(match('/tags/a%2Fb')).toEqual({ route: 'tag', params: { path: ['a/b'] } })
    expect(match('/tags')).toBeNull()
    expect(match('/archive')).toEqual({ route: 'archive', params: { year: null } })
    expect(match('/archive/2025/')).toEqual({ route: 'archive', params: { year: '2025' } })
    expect(match('/archive/2025/x')).toBeNull()
    const star = routePattern('/files/:path*')
    expect(['/files', '/files/a/b'].map((p) => star.pattern.test(p))).toEqual([true, true])
  })

  it('builds canonical URLs with encoded segments and drops a missing optional segment', () => {
    expect(pathOf('/tags/:path+', { path: ['tech', 'a b', 'c/d'] })).toBe('/tags/tech/a%20b/c%2Fd')
    expect(pathOf('/archive/:year?', { year: null })).toBe('/archive')
    expect(pathOf('/archive/:year?', { year: '2026' })).toBe('/archive/2026')
    expect(pathOf('/:lang?', { lang: null })).toBe('/')
    expect(pathOf('/files/:path*/', { path: [] })).toBe('/files/')
  })

  it('prefers the more specific route', () => {
    const doc = { ...build, ir: structuredClone(build.ir) }
    doc.ir.routes.intro = { path: '/tags/intro', params: null, search: null }
    doc.ir.pages.intro = doc.ir.pages.home!
    expect(matcher(doc)('/tags/intro')).toEqual({ route: 'intro', params: null })
    expect(matcher(doc)('/tags/intro/more')?.route).toBe('tag')
  })
})
