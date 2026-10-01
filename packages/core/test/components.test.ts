import { event, feature, machine, project, query, route, ui } from '@hozu/core'
import { buildProject, type ElementNode, type ViewNode } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { createTV } from '@hozu/variants'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const tv = createTV({})
const home = route({ path: '/', params: null, search: null })
const Save = event({ payload: z.object({}) })
const board = machine({
  context: z.object({ busy: z.boolean(), label: z.string() }),
  initialContext: { busy: false, label: 'Save' },
  initial: 'idle',
  states: () => ({ idle: { on: [] } }),
})

const styles = tv({
  base: 'inline-flex items-center gap-2 rounded font-medium',
  variants: {
    tone: { primary: 'bg-indigo-600 text-white', ghost: 'text-slate-700 hover:bg-slate-100' },
    size: { sm: 'px-2 py-1 text-sm', md: 'px-4 py-2' },
  },
  compoundVariants: [{ tone: 'ghost', size: 'sm', class: 'underline' }],
  defaultVariants: { tone: 'primary', size: 'md' },
})

export const Button = ui.component({
  tag: 'button',
  styles,
  props: z.object({
    type: z.enum(['button', 'submit']).default('button'),
    disabled: z.boolean().default(false),
    pressed: z.boolean().optional(),
  }),
  slots: ['icon'],
  children: true,
  events: ['press'],
  render: ({ props, slots, children, on }) =>
    ui.button(
      {
        type: props.type,
        disabled: props.disabled,
        'aria-pressed': props.pressed,
        toggle: { 'ring-2': props.disabled },
        on: { click: on.press },
      },
      [slots.icon, ...children],
    ),
})

const kit = ui.kit({ id: 'ui', components: [{ Button }] })

const build = (declarations: object[], extra: { kits?: object[]; features?: object[] } = {}) =>
  buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [],
      kits: (extra.kits ?? [kit]) as never,
      features: [
        feature({ id: 'f', intent: { summary: 'ADR 0045 phase 2' }, declarations }),
        ...((extra.features ?? []) as never[]),
      ],
    }),
  )

const first = (b: ReturnType<typeof build>, view = 'View'): ViewNode => {
  const root = b.ir.features.f!.views[view]!.root
  return root.kind === 'el' ? root.children[0]! : root
}

const withoutUse = (n: ViewNode) => {
  const { use: _, ...rest } = n as ElementNode
  return rest
}

describe('ADR 0045 phase 2: a pure ui.use', () => {
  it('builds the IR of the hand-written subtree, apart from use', () => {
    const b = build([
      {
        board,
        Save,
        View: ui.view({
          machine: board,
          render: ({ ctx }) =>
            ui.div({}, [
              ui.use(
                Button,
                {
                  variant: { tone: 'ghost' },
                  props: { disabled: ctx.busy },
                  on: { press: ui.send(Save, {}) },
                  class: 'w-full',
                },
                [ctx.label],
              ),
            ]),
        }),
        Inline: ui.view({
          machine: board,
          render: ({ ctx }) =>
            ui.div({}, [
              ui.button(
                {
                  type: 'button',
                  disabled: ctx.busy,
                  toggle: { 'ring-2': ctx.busy },
                  on: { click: ui.send(Save, {}) },
                  class:
                    'inline-flex items-center gap-2 rounded font-medium text-slate-700 hover:bg-slate-100 px-4 py-2 w-full',
                },
                [ctx.label],
              ),
            ]),
        }),
      },
    ])
    expect(b.diagnostics).toEqual([])
    const used = first(b) as ElementNode
    const inline = first(b, 'Inline') as ElementNode
    expect(JSON.stringify(withoutUse(used)).replaceAll('f.View', 'f.X')).toBe(
      JSON.stringify(inline).replaceAll('f.Inline', 'f.X'),
    )
    expect(used.use).toEqual({
      component: 'ui.Button',
      variant: { tone: 'ghost', size: 'md' },
      added: ['w-full'],
      overrides: [],
    })
  })

  it('fills omitted props from the schema defaults, drops missing slots and events, and records overrides', () => {
    const b = build([
      {
        View: ui.view({ render: () => ui.div({}, [ui.use(Button, { class: 'bg-red-500! z-10' }, ['Go'])]) }),
      },
    ])
    expect(b.diagnostics).toEqual([])
    const n = first(b) as ElementNode
    expect(n.attrs).toEqual({ type: { literal: 'button' }, disabled: { literal: false } })
    expect(n.on).toEqual({})
    expect(n.children).toEqual([{ id: 'f.View/0/0', kind: 'text', value: { literal: 'Go' } }])
    expect(n.class?.split(' ')).toEqual([...styles({}).split(' '), 'bg-red-500!', 'z-10'])
    expect(n.use).toEqual({
      component: 'ui.Button',
      variant: { tone: 'primary', size: 'md' },
      added: ['bg-red-500!', 'z-10'],
      overrides: ['bg-red-500!'],
    })
  })

  it('records the kit component in ProjectIR.kits with its schema in the kit', () => {
    const b = build([{ View: ui.view({ render: () => ui.div({}, []) }) }])
    const c = b.ir.kits.ui!.components.Button!
    expect(c).toMatchObject({
      tag: 'button',
      variants: { tone: ['primary', 'ghost'], size: ['sm', 'md'] },
      defaults: { tone: 'primary', size: 'md' },
      slots: ['icon'],
      children: true,
      events: ['press'],
      emits: {},
      extend: true,
      client: null,
    })
    expect(b.ir.kits.ui!.schemas[c.props]).toMatchObject({ type: 'object' })
    expect(c.owned).toEqual(
      [
        ...'inline-flex items-center gap-2 rounded font-medium bg-indigo-600 text-white text-slate-700 hover:bg-slate-100 px-2 py-1 text-sm px-4 py-2 underline ring-2'.split(
          ' ',
        ),
      ].sort(),
    )
    expect(c.sourceHash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('takes tv slots: the base slot is the root class, the others go to classes', () => {
    const field = tv({
      slots: { base: 'space-y-3', label: 'block text-sm' },
      variants: { quiet: { true: { label: 'sr-only' } } },
    })
    const Field = ui.component({
      tag: 'div',
      styles: field,
      props: z.object({ label: z.string() }),
      render: ({ props, classes }) => ui.div({}, [ui.label({ class: classes.label }, [props.label])]),
    })
    const b = build([
      {
        Field,
        View: ui.view({
          render: () => ui.div({}, [ui.use(Field, { variant: { quiet: true }, props: { label: 'Name' } })]),
        }),
      },
    ])
    expect(b.diagnostics).toEqual([])
    const n = first(b) as ElementNode
    expect(n.class).toBe('space-y-3')
    expect((n.children[0] as ElementNode).class).toBe('block text-sm sr-only')
    expect(n.use?.component).toBe('f.Field')
    expect(b.ir.features.f!.components.Field!.owned).toEqual(['space-y-3'])
    const off = build([
      {
        Field,
        View: ui.view({
          render: () => ui.div({}, [ui.use(Field, { variant: { quiet: false }, props: { label: 'Name' } })]),
        }),
      },
    ])
    expect(off.diagnostics).toEqual([])
    expect(((first(off) as ElementNode).children[0] as ElementNode).class).toBe('block text-sm')
    expect((first(off) as ElementNode).use?.variant).toEqual({ quiet: 'false' })
  })
})

describe('ADR 0045 phase 2 diagnostics', () => {
  const codes = (b: ReturnType<typeof build>) => b.diagnostics.map((d) => [d.code, d.location.pointer])

  it('HZ031 — a variant literal outside its values; HZ071 — a variant from a reference', () => {
    const b = build([
      board,
      {
        board,
        View: ui.view({
          machine: board,
          render: ({ ctx }) =>
            ui.div({}, [
              ui.use(Button, { variant: { tone: 'loud' as never } }, []),
              ui.use(Button, { variant: { tone: (ctx.busy ? 'ghost' : 'primary') as 'ghost' } }, []),
            ]),
        }),
      },
    ])
    expect(codes(b)).toEqual([
      ['HZ031', '/features/f/views/View/root/children/0/variant/tone'],
      ['HZ071', '/features/f/views/View/root/children/1/variant/tone'],
    ])
  })

  it('HZ006 — another feature uses a private component; HZ007 — a component in no kit or feature', () => {
    const Badge = ui.component({ tag: 'span', render: () => ui.span({}, []) })
    const Loose = ui.component({ tag: 'span', render: () => ui.span({}, []) })
    const other = feature({
      id: 'g',
      intent: { summary: 'other' },
      declarations: [{ View: ui.view({ render: () => ui.div({}, [ui.use(Badge, {})]) }) }],
    })
    const b = build([{ Badge, View: ui.view({ render: () => ui.div({}, [ui.use(Loose, {})]) }) }], {
      features: [other],
    })
    expect(codes(b)).toEqual([
      ['HZ007', '/features/f/views/View/root/children/0/component'],
      ['HZ006', '/features/g/views/View/root/children/0/component'],
    ])
  })

  it('HZ013 — a kit id equal to a feature id, or declared twice', () => {
    const b = build([{ View: ui.view({ render: () => ui.div({}, []) }) }], {
      kits: [kit, ui.kit({ id: 'f', components: [] }), ui.kit({ id: 'ui', components: [] })],
    })
    expect(codes(b)).toEqual([
      ['HZ013', '/kits/1/id'],
      ['HZ013', '/kits/2/id'],
    ])
  })

  it('HZ014 — the root tag, a class on the root, and client components', () => {
    const Wrong = ui.component({ tag: 'button', render: () => ui.span({}, []) })
    const Classed = ui.component({ tag: 'span', render: () => ui.span({ class: 'p-2' }, []) })
    const Client = ui.component({
      tag: 'div',
      client: new URL('./x.client.ts', import.meta.url),
      load: 'idle',
      render: () => ui.div({}, []),
    })
    const b = build([
      {
        Wrong,
        Classed,
        Client,
        View: ui.view({
          render: () => ui.div({}, [ui.use(Wrong, {}), ui.use(Classed, {}), ui.use(Client, {})]),
        }),
      },
    ])
    expect(b.diagnostics.map((d) => [d.code, d.location.pointer, d.message])).toEqual([
      [
        'HZ014',
        '/features/f/components/Client/client',
        'A client ui.component is not supported until ADR 0045 phase 4',
      ],
      [
        'HZ014',
        '/features/f/views/View/root/children/0',
        'The render of f.Wrong must return a <button> element',
      ],
      [
        'HZ014',
        '/features/f/views/View/root/children/1/class',
        'The render of f.Classed sets class on its root',
      ],
      [
        'HZ014',
        '/features/f/views/View/root/children/2',
        'A client ui.component is not supported until ADR 0045 phase 4',
      ],
    ])
    expect(b.diagnostics.every((d) => d.fix?.summary)).toBe(true)
  })

  it('HZ044 — a render from untransformed code, in a feature or a kit', () => {
    const untransformed = ui.component.bind(ui) as typeof ui.component
    const Raw = untransformed({ tag: 'span', render: () => ui.span({}, []) })
    const KitRaw = untransformed({ tag: 'span', render: () => ui.span({}, []) })
    const b = build([{ Raw, View: ui.view({ render: () => ui.div({}, []) }) }], {
      kits: [kit, ui.kit({ id: 'raw', components: [{ KitRaw }] })],
    })
    expect(codes(b)).toEqual([
      ['HZ044', '/features/f/components/Raw'],
      ['HZ044', '/kits/raw/components/KitRaw'],
    ])
  })

  it('HZ070 — the render references a declaration; values the caller passes are not', () => {
    const Leaky = ui.component({
      tag: 'a',
      render: () => ui.a({ href: ui.link(home, null), on: { click: ui.send(Save, {}) } }, []),
    })
    const Closed = ui.component({
      tag: 'a',
      props: z.object({ href: z.string() }),
      events: ['press'],
      render: ({ props, on }) => ui.a({ href: props.href, on: { click: on.press } }, []),
    })
    const b = build([
      {
        Save,
        Leaky,
        Closed,
        View: ui.view({
          render: () =>
            ui.div({}, [
              ui.use(Leaky, {}),
              ui.use(Leaky, {}),
              ui.use(Closed, { props: { href: ui.link(home, null) }, on: { press: ui.send(Save, {}) } }),
            ]),
        }),
      },
    ])
    expect(b.diagnostics.map((d) => [d.code, d.location.pointer, d.message])).toEqual([
      ['HZ070', '/features/f/components/Leaky', 'The render of f.Leaky references route home'],
      ['HZ070', '/features/f/components/Leaky', 'The render of f.Leaky references event f.Save'],
    ])
  })

  it('HZ070 — an unused feature component that sends an event', () => {
    const Unused = ui.component({
      tag: 'button',
      render: () => ui.button({ on: { click: ui.send(Save, {}) } }, []),
    })
    const b = build([{ Save, Unused, View: ui.view({ render: () => ui.div({}, []) }) }])
    expect(b.diagnostics.map((d) => [d.code, d.location.pointer, d.message])).toEqual([
      ['HZ070', '/features/f/components/Unused', 'The render of f.Unused references event f.Save'],
    ])
    expect(b.diagnostics[0]!.location.source?.file).toMatch(/components\.test\.ts$/)
  })

  it('HZ070 — an unused kit component that reads a query', () => {
    const listItems = query({
      input: z.object({}),
      output: z.array(z.string()),
      scope: 'public',
      freshness: 'static',
    })
    const List = ui.component({
      tag: 'ul',
      render: () =>
        ui.ul({}, [
          ui.query(
            listItems,
            {},
            { ready: (items) => ui.li({}, [items.length]), failed: { Unexpected: () => null } },
          ),
        ]),
    })
    const b = build([{ listItems, View: ui.view({ render: () => ui.div({}, []) }) }], {
      kits: [kit, ui.kit({ id: 'lists', components: [{ List }] })],
    })
    expect(b.diagnostics.map((d) => [d.code, d.location.pointer, d.message])).toEqual([
      ['HZ070', '/kits/lists/components/List', 'The render of lists.List references query f.listItems'],
    ])
  })

  it('a render must build under reference props: HZ059 for a reference escape, HZ014 for another throw', () => {
    const Shout = ui.component({
      tag: 'p',
      props: z.object({ text: z.string() }),
      render: ({ props }) => ui.p({}, [props.text.toUpperCase()]),
    })
    const Broken = ui.component({
      tag: 'p',
      render: () => {
        throw new Error('boom')
      },
    })
    const b = build([{ Shout, Broken, View: ui.view({ render: () => ui.div({}, []) }) }])
    expect(b.diagnostics.map((d) => [d.code, d.location.pointer, d.message.split(':')[0]])).toEqual([
      ['HZ059', '/features/f/components/Shout', 'The render of f.Shout does not build under reference props'],
      [
        'HZ014',
        '/features/f/components/Broken',
        'The render of f.Broken does not build under reference props',
      ],
    ])
    expect(b.diagnostics.every((d) => d.fix?.snippet)).toBe(true)
    expect(Object.keys(b.bindings.components).filter((id) => id.startsWith('f.'))).toEqual([])
  })
})

describe('ADR 0045 phase 3: bindings.components', () => {
  it("records the classes of the render's inner elements, tv slots and nested uses included, not the caller's", () => {
    const Panel = ui.component({
      tag: 'section',
      styles: tv({ slots: { base: 'p-4', title: 'text-lg font-bold' } }),
      slots: ['body'],
      children: true,
      render: ({ slots, children, classes }) =>
        ui.section({ toggle: { 'ring-2': true } }, [
          ui.h2({ class: classes.title, toggle: { underline: true } }, ['Title']),
          ui.use(Button, { class: 'w-full' }, ['Go']),
          slots.body,
          ...children,
        ]),
    })
    const View = ui.view({
      render: () =>
        ui.div({}, [
          ui.use(Panel, { slots: { body: ui.p({ class: 'text-rose-600' }, []) } }, [
            ui.span({ class: 'italic' }, []),
          ]),
        ]),
    })
    const b = build([{ Panel, View }])
    expect(b.diagnostics).toEqual([])
    expect(b.bindings.components['f.Panel']).toEqual({
      inner: ['font-bold', 'text-lg', 'underline', 'w-full'],
    })
    expect(b.bindings.components['ui.Button']).toEqual({ inner: [] })
  })
})
