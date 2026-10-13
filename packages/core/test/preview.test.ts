import { feature, project, route, ui } from '@hozu/core'
import { buildProject, type ElementNode, exampleProject, previewsModulesOf } from '@hozu/core/ir'
import { previews } from '@hozu/core/preview'
import { zodAdapter } from '@hozu/schema-zod'
import { createTV } from '@hozu/variants'
import { describe, expect, it } from 'vitest'

const tv = createTV({})
const home = route({ path: '/', params: null, search: null })

const Button = ui.component({
  tag: 'button',
  styles: tv({ base: 'rounded', variants: { tone: { solid: 'font-bold', ghost: 'underline' } } }),
  children: true,
  render: ({ children }) => ui.button({ type: 'button' }, children),
})
const Row = ui.component({
  tag: 'div',
  styles: tv({ base: 'flex' }),
  children: true,
  render: ({ children }) => ui.div({}, children),
})

const kit = ui.kit({ id: 'ui', components: [{ Button, Row }] })
const app = (extra: object = {}) =>
  project({
    schema: zodAdapter,
    routes: { home },
    pages: [],
    kits: [kit],
    features: [feature({ id: 'f', intent: { summary: 'previews' }, declarations: [] })],
    ...extra,
  } as never)

describe('p.example and a list of previews files', () => {
  it('records a named, composed example and builds it alone, as written', () => {
    const set = previews((p) => [
      p.example(Row, 'Save and cancel', () =>
        ui.use(Row, {}, [
          ui.use(Button, { variant: { tone: 'solid' } }, ['Save']),
          ui.use(Button, {}, ['Cancel']),
        ]),
      ),
    ])
    const example = set.list[0]!
    expect(example).toMatchObject({ kind: 'example', name: 'Save and cancel', component: Row })
    expect(example.at?.file).toContain('preview.test.ts')
    if (example.kind !== 'example') throw new Error('not an example')
    const built = buildProject(exampleProject(app(), 'ui.Row', example.render))
    expect(built.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const root = Object.values(built.ir.features.hozuRender!.views)[0]!.root as ElementNode
    expect(root.tag).toBe('div')
    expect(root.children.map((c) => (c as ElementNode).tag)).toEqual(['button', 'button'])
    expect(exampleProject(app(), 'ui.Missing', example.render)).toBeNull()
  })

  it('project({ previews }) takes one URL or a list; an entry that is not a file URL is HZ014', () => {
    const a = new URL('file:///app/previews.ts')
    const b = new URL('file:///app/ui/previews.ts')
    expect(previewsModulesOf(app({ previews: a }))).toEqual(['/app/previews.ts'])
    expect(previewsModulesOf(app({ previews: [a, b] }))).toEqual(['/app/previews.ts', '/app/ui/previews.ts'])
    const bad = buildProject(app({ previews: [a, './x.ts'] })).diagnostics.filter((d) => d.code === 'HZ014')
    expect(bad.map((d) => [d.location.pointer, d.message])).toEqual([
      ['/previews/1', 'project({ previews }) must be a file URL or a list of them'],
    ])
  })
})
