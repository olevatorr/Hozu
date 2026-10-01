import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { event, feature, part, project, route, ui } from '@hozu/core'
import { buildProject, type Diagnostic } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const Save = event({ payload: z.object({}) })
const card = part((title: string) => ui.article({ class: 'rounded p-4' }, [title]))
const saving = part((title: string) => ui.button({ on: { click: ui.send(Save, {}) } }, [title]))

const inlined = (ids: string[], child: () => unknown, kits: object[] = []) =>
  buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [],
      kits: kits as never,
      features: ids.map((id, i) =>
        feature({
          id,
          intent: { summary: id },
          declarations: [
            {
              ...(i === 0 ? { Save } : {}),
              View: ui.view({ render: () => ui.main({}, [child() as never, child() as never]) }),
            },
          ],
        }),
      ),
    }),
  ).diagnostics

const hz080 = (ds: Diagnostic[]) => ds.filter((d) => d.code === 'HZ080')
const tmp = join(fileURLToPath(new URL('../../../', import.meta.url)), '.tmp', `hz080-${process.pid}`)
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('HZ080 shared-part-view (ADR 0045 K)', () => {
  it('reports a declaration-free view part inlined by two features, once, at the part', () => {
    const found = hz080(inlined(['one', 'two'], () => card('Hi')))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      severity: 'warning',
      message: 'card returns a view that one, two inline',
      location: { feature: 'one', pointer: '/features/one' },
    })
    expect(found[0]!.location.source?.file).toMatch(/shared-parts\.test\.ts$/)
    expect(found[0]!.fix?.snippet).toContain("export const Card = ui.component({\n  tag: 'article',")
  })

  it('names at most three features', () => {
    const [d] = hz080(inlined(['a', 'b', 'c', 'd', 'e'], () => card('Hi')))
    expect(d!.message).toBe('card returns a view that a, b, c, +2 inline')
  })

  it('is silent for one feature and for a part that references a declaration', () => {
    expect(hz080(inlined(['one'], () => card('Hi')))).toEqual([])
    expect(hz080(inlined(['one', 'two'], () => saving('Save')))).toEqual([])
  })

  it('suggests a component that builds without HZ070 when pasted', async () => {
    const [d] = hz080(inlined(['one', 'two'], () => card('Hi')))
    const declaration = d!.fix!.snippet!.slice(0, d!.fix!.snippet!.indexOf('\n// in each feature'))
    mkdirSync(tmp, { recursive: true })
    const file = join(tmp, 'card.ts')
    writeFileSync(
      file,
      `import { ui } from '@hozu/core'\nimport { createTV } from '@hozu/variants'\nimport { z } from 'zod'\n\nconst tv = createTV({})\n\n${declaration}\n`,
    )
    const mod = (await import(file)) as { Card: object }
    const kit = ui.kit({ id: 'ui', components: [mod] })
    const ds = inlined(['one', 'two'], () => ui.use(mod.Card as never, {}), [kit])
    expect(ds.filter((x) => x.severity === 'error')).toEqual([])
    expect(ds.map((x) => x.code)).not.toContain('HZ070')
    expect(hz080(ds)).toEqual([])
  })
})
