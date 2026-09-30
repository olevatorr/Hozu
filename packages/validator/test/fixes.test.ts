import { endpoint, event, feature, machine, on, project, route, ui } from '@hozu/core'
import { buildProject, type Diagnostic, type ElementNode, type ProjectIR } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { applyPatch } from './support/patch.ts'

const Add = event({ payload: z.object({ title: z.string() }) })
const Pick = event({ payload: z.object({ id: z.string() }) })
const items = machine({
  context: z.object({ list: z.array(z.object({ id: z.string() })) }),
  initialContext: { list: [] },
  initial: 'idle',
  states: () => ({ idle: { on: [on(Add, { target: 'idle' }), on(Pick, { target: 'idle' })] } }),
})
const save = endpoint({
  method: 'POST',
  path: '/api/save',
  input: z.object({ title: z.string() }),
  output: 'redirect',
})
const home = route({ path: '/', params: null, search: null })

const build = (View: ReturnType<typeof ui.view>) =>
  buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [View], head: { render: () => ({ title: 'Fixes' }) } })],
      features: [
        feature({ id: 'f', intent: { summary: 'fixes' }, declarations: [{ Add, Pick, items, save, View }] }),
      ],
    }),
  )

const Plain = ui.view({
  machine: items,
  render: () =>
    ui.form({ on: { submit: ui.send(Add, { title: ui.dom.form('title') }) } }, [ui.input({ name: 'title' })]),
})

const of = (ir: ProjectIR, code: string, diagnostics: Diagnostic[] = []): Diagnostic[] =>
  [...diagnostics, ...validate(ir)].filter((d) => d.code === code)

describe('AI-first acceptance: the changed codes carry a patch or an exact snippet (ADR 0043)', () => {
  it('HZ046: an endpoint method other than GET or POST is patched to POST', () => {
    const ir = structuredClone(build(Plain).ir)
    ir.features.f!.endpoints.save!.method = 'PUT' as 'POST'
    const [d] = of(ir, 'HZ046')
    expect(d!.fix!.snippet).toBe("method: 'POST',")
    expect(of(applyPatch(ir, d!.fix!.patch!), 'HZ046')).toEqual([])
  })

  it('HZ046: a native form field the endpoint input does not declare gets the name to use', () => {
    const b = build(
      ui.view({
        render: () => ui.form({ method: 'post', action: ui.link(save) }, [ui.input({ name: 'titel' })]),
      }),
    )
    expect(of(b.ir, 'HZ046').map((d) => d.fix!.snippet)).toEqual(["name: 'title'"])
  })

  it('HZ036: a form that needs JavaScript gets the send to paste, with its own fields', () => {
    const ir = structuredClone(build(Plain).ir)
    const form = ir.features.f!.views.View!.root as ElementNode
    form.on.submit!.payload = { object: { title: { ref: 'dom', path: ['value'] } } }
    expect(of(ir, 'HZ036').map((d) => d.fix!.snippet)).toEqual([
      "on: { submit: ui.send(Add, { title: ui.dom.form('title') }) }",
    ])
  })

  it('HZ032: a redirect to an internal path names the route to link', () => {
    const ir = structuredClone(build(Plain).ir)
    ir.http.redirects = [
      { from: '/old', to: { literal: '/' }, permanent: true },
    ] as ProjectIR['http']['redirects']
    expect(of(ir, 'HZ032').map((d) => d.fix!.snippet)).toEqual(['to: () => ui.link(home, null),'])
  })

  it('HZ014: formRef misuse has a snippet', () => {
    const bulk = ui.formRef()
    const b = build(
      ui.view({
        machine: items,
        render: ({ ctx }) =>
          ui.div({}, [
            ui.each(ctx.list, 'id', (item) =>
              ui.form({ ref: bulk, id: 'x', on: { submit: ui.send(Pick, { id: item.id }) } }, []),
            ),
            ui.input({ form: bulk, name: 'id' }),
          ]),
      }),
    )
    const found = of(b.ir, 'HZ014', b.diagnostics)
    expect(found.length).toBeGreaterThanOrEqual(2)
    for (const d of found) expect(d.fix?.snippet ?? null, d.message).not.toBeNull()
  })
})
