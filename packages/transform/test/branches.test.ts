import { feature, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { app, createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const words = query({
  input: z.object({ fail: z.boolean() }),
  output: z.array(z.string()),
  errors: { Gone: z.object({}) },
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})
const List = ui.view({
  render: () =>
    ui.main({}, [
      ui.query(
        words,
        { fail: false },
        {
          ready: (list) =>
            list.length > 0
              ? ui.ul({}, [
                  ui.each(list, null, (w) =>
                    w === 'b' ? ui.li({}, [w]) : [ui.li({}, [w]), ui.li({}, ['+'])],
                  ),
                ])
              : [ui.p({}, ['none']), ui.p({}, ['yet'])],
          pending: null,
          failed: {
            Gone: () => ui.p({}, ['gone']),
            Unexpected: (e) =>
              e.message === '' ? ui.p({}, ['?']) : [ui.p({}, ['error']), ui.p({}, [e.message])],
          },
        },
      ),
    ]),
})
const p = project({
  schema: zodAdapter,
  routes: { home },
  pages: [ui.page(home, { views: [List], head: { render: () => ({ title: 'Words' }) } })],
  features: [feature({ id: 'w', intent: { summary: 'branches' }, declarations: [{ words, List }] })],
})

describe('a view callback may return c ? a : [b, c] (ADR 0043 H branches)', () => {
  it('lowers each branch position to an if node', () => {
    const build = buildProject(p)
    expect(build.diagnostics).toEqual([])
    const main = build.ir.features.w!.views.List!.root
    const q = main.kind === 'el' ? main.children[0]! : null
    if (q?.kind !== 'query') throw new Error('expected a query node')
    expect(q.ready).toMatchObject({ kind: 'if', ifFalse: [{ kind: 'el' }, { kind: 'el' }] })
    expect(q.failed.Unexpected).toMatchObject({ kind: 'if', ifFalse: [{ kind: 'el' }, { kind: 'el' }] })
    const ul = q.ready.kind === 'if' ? q.ready.ifTrue[0]! : null
    const each = ul?.kind === 'el' ? ul.children[0]! : null
    expect(each).toMatchObject({ kind: 'each', item: { kind: 'if', ifFalse: [{}, {}] } })
  })

  it('a plain list stays HZ014, with the wrapping element as the fix', () => {
    const Loose = ui.view({
      render: () =>
        ui.main({}, [
          ui.query(
            words,
            { fail: false },
            {
              ready: () => [ui.p({}, ['a']), ui.p({}, ['b'])],
              failed: { Gone: () => null, Unexpected: () => null },
            },
          ),
        ]),
    })
    const build = buildProject(
      project({
        schema: zodAdapter,
        routes: { home },
        pages: [ui.page(home, { views: [Loose], head: { render: () => ({ title: 'x' }) } })],
        features: [feature({ id: 'w', intent: { summary: 'loose' }, declarations: [{ words, Loose }] })],
      }),
    )
    expect(build.diagnostics.map((d) => [d.code, d.location.pointer])).toEqual([
      ['HZ014', '/features/w/views/Loose/root/children/0/ready'],
    ])
    expect(build.diagnostics[0]!.cause).toContain('wraps them in one element')
  })

  it('renders every node of a list branch', async () => {
    const html = async (list: string[]) => {
      const handler = createHandler(
        app({ resolvers: resolvers(p, (implement) => [implement(words, () => list)]) }),
      )
      return (await handler.fetch(new Request('http://x.test/'))).text()
    }
    expect(await html(['a', 'b'])).toContain('<ul><li>a</li><li>+</li><li>b</li></ul>')
    expect(await html([])).toContain('<p>none</p><p>yet</p>')
  })
})
