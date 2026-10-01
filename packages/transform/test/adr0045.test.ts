import { feature, machine, part, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

type Tone = 'primary' | 'ghost'
const tones = { primary: 'bg-indigo-600 text-white', ghost: 'text-slate-700' } as const

const home = route({ path: '/', params: null, search: null })
const board = machine({
  context: z.object({ busy: z.boolean() }),
  initialContext: { busy: false },
  initial: 'idle',
  states: () => ({ idle: {} }),
})

const build = (declarations: object) =>
  buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [], head: { render: () => ({ title: 'x' }) } })],
      features: [feature({ id: 'f', intent: { summary: 'ADR 0045 G' }, declarations: [declarations] })],
    }),
    { sources: true },
  )

const button = (declarations: object) => {
  const b = build(declarations)
  const root = b.ir.features.f!.views.View!.root
  const first = root.kind === 'el' ? root.children[0] : null
  return { codes: b.diagnostics.map((d) => d.code), node: first?.kind === 'el' ? first : null }
}

const byCompare = part((tone: Tone, label: string) =>
  ui.button({ type: 'button', class: tone === 'primary' ? tones.primary : tones.ghost }, [label]),
)
const byDefault = part((o: { tone?: Tone }, label: string) =>
  ui.button({ type: 'button', class: tones[o.tone ?? 'primary'] }, [label]),
)
const byTemplate = part((o: { extra?: string }, label: string) =>
  ui.button({ type: 'button', class: `rounded ${o.extra ?? ''}`.trim() }, [label]),
)
const byState = part((busy: boolean, label: string) =>
  ui.button({ type: 'button', disabled: busy, toggle: { 'opacity-50': busy } }, [label]),
)

describe('ADR 0045 G: a part called with literals equals the inline form with those literals', () => {
  it.fails('=== and ?: on literal arguments give a static class', () => {
    const { codes, node } = button({
      View: ui.view({ render: () => ui.div({}, [byCompare('ghost', 'Go')]) }),
    })
    expect(codes).toEqual([])
    expect(node?.class).toBe('text-slate-700')
  })

  it.fails('?? on an omitted argument gives a static class', () => {
    const { codes, node } = button({ View: ui.view({ render: () => ui.div({}, [byDefault({}, 'Go')]) }) })
    expect(codes).toEqual([])
    expect(node?.class).toBe('bg-indigo-600 text-white')
  })

  it.fails('a template string over a literal ?? gives a static class', () => {
    const { codes, node } = button({
      View: ui.view({ render: () => ui.div({}, [byTemplate({ extra: 'w-full' }, 'Go')]) }),
    })
    expect(codes).toEqual([])
    expect(node?.class).toBe('rounded w-full')
  })

  it('a reference argument still lowers to IR', () => {
    const { codes, node } = button({
      board,
      View: ui.view({ machine: board, render: ({ ctx }) => ui.div({}, [byState(ctx.busy, 'Go')]) }),
    })
    expect(codes).toEqual([])
    expect(node?.toggle['opacity-50']).toEqual({ ref: 'context', path: ['busy'] })
    expect(node?.attrs.disabled).toEqual({ ref: 'context', path: ['busy'] })
  })
})
