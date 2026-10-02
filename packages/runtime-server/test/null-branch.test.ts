import { feature, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const districts = query({
  input: z.object({}),
  output: z.array(z.string()),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
const Home = ui.view({
  render: () =>
    ui.main({}, [
      ui.select({ 'aria-label': 'District' }, [
        ui.option({ value: '' }, ['All districts']),
        ui.query(
          districts,
          {},
          {
            ready: (names) => ui.each(names, null, (name) => ui.option({ value: name }, [name])),
            failed: { Unexpected: () => null },
          },
        ),
      ]),
    ]),
})
const app = project({
  schema: zodAdapter,
  routes: { home },
  pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Home' }) } })],
  features: [feature({ id: 'd', intent: { summary: 'null branch' }, declarations: [{ districts, Home }] })],
})

describe('a query branch that returns null renders nothing', () => {
  it('builds without HZ014 and renders no content when the query fails', async () => {
    const build = buildProject(app, { sources: false })
    expect(build.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const handler = createHandler({
      build,
      resolvers: resolvers(app, (implement) => [
        implement(districts, () => {
          throw new Error('down')
        }),
      ]),
      onError: () => {},
    })
    const html = await (await handler.fetch(new Request('http://localhost/'))).text()
    const select = /<select[^>]*>([\s\S]*?)<\/select>/.exec(html)![1]!.replace(/<!--[^>]*-->/g, '')
    expect(select).toBe('<option value>All districts</option>')
  })
})
