import { feature, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'

describe('a link turned into text (ADR 0089, found building ui.hozu.org)', () => {
  it('stops the build at the view instead of rendering "[object Object]"', () => {
    const home = route({ path: '/', params: null, search: null })
    const Nav = ui.view({ render: () => ui.a({ href: `${ui.link(home, null)}#devtools` }, ['DevTools']) })
    const build = buildProject(
      project({
        schema: zodAdapter,
        routes: { home },
        pages: [ui.page(home, { views: [Nav], head: { render: () => ({ title: 'x' }) } })],
        features: [feature({ id: 'f', intent: { summary: 'x' }, declarations: [{ Nav }] })],
      }),
      { sources: false },
    )
    expect(build.diagnostics.map((d) => [d.code, d.message])).toContainEqual([
      'HZ059',
      expect.stringContaining('ui.link(…) was turned into text'),
    ])
  })
})
