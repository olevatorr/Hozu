import { event, feature, machine, on, project, route, ui } from '@hozu/core'
import { buildProject, type Diagnostic } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { applyPatch } from './support/patch.ts'

const Bulk = event({
  payload: z.object({ ids: z.array(z.string()), action: z.enum(['delete', 'archive']) }),
})
const One = event({ payload: z.object({ id: z.string() }) })
const Remember = event({ payload: z.object({ remember: z.boolean() }) })
const Pick = event({ payload: z.object({ size: z.enum(['s', 'm']).nullable() }) })

const lists = machine({
  context: z.object({ items: z.array(z.object({ id: z.string() })) }),
  initialContext: { items: [] },
  initial: 'idle',
  states: () => ({
    idle: {
      on: [
        on(Bulk, { target: 'idle' }),
        on(One, { target: 'idle' }),
        on(Remember, { target: 'idle' }),
        on(Pick, { target: 'idle' }),
      ],
    },
  }),
})
const home = route({ path: '/', params: null, search: null })

const build = (View: ReturnType<typeof ui.view>, extra: Record<string, unknown> = {}) =>
  buildProject(
    project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [View], head: { render: () => ({ title: 'Forms' }) } })],
      features: [
        feature({
          id: 'f',
          intent: { summary: 'forms' },
          declarations: [{ Bulk, One, Remember, Pick, lists, View, ...extra }],
        }),
      ],
    }),
  )

type Built = ReturnType<typeof build>
const found = (b: Built, codes: string[]): Diagnostic[] =>
  [...b.diagnostics, ...validate(b.ir, { sources: b.sources })].filter((d) => codes.includes(d.code))
const codesOf = (b: Built, codes: string[]) => found(b, codes).map((d) => d.code)

describe('ADR 0043 C form rules', () => {
  it('HZ054 does not fire for a radio group, submit buttons or one control per per-item form', () => {
    const b = build(
      ui.view({
        machine: lists,
        render: ({ ctx }) =>
          ui.div({}, [
            ui.form(
              { on: { submit: ui.send(Bulk, { ids: ui.dom.formAll('ids'), action: ui.dom.form('action') }) } },
              [
                ui.input({ type: 'checkbox', name: 'ids', value: 'a' }),
                ui.input({ type: 'checkbox', name: 'ids', value: 'b' }),
                ui.button({ type: 'submit', name: 'action', value: 'delete' }, ['Delete']),
                ui.button({ type: 'submit', name: 'action', value: 'archive' }, ['Archive']),
              ],
            ),
            ui.form({ on: { submit: ui.send(Pick, { size: ui.dom.form('size') }) } }, [
              ui.input({ type: 'radio', name: 'size', value: 's' }),
              ui.input({ type: 'radio', name: 'size', value: 'm' }),
            ]),
            ui.ul({}, [
              ui.each(ctx.items, 'id', (item) =>
                ui.li({}, [
                  ui.form({ on: { submit: ui.send(One, { id: ui.dom.form('id') }) } }, [
                    ui.input({ type: 'hidden', name: 'id', value: item.id }),
                    ui.button({ type: 'submit' }, ['Go']),
                  ]),
                ]),
              ),
            ]),
          ]),
      }),
    )
    expect(found(b, ['HZ054', 'HZ055', 'HZ033', 'HZ036', 'HZ027', 'HZ014'])).toEqual([])
  })

  it('HZ054 fires for controls repeated by ui.each inside the form, with a patch to formAll', () => {
    const b = build(
      ui.view({
        machine: lists,
        render: ({ ctx }) =>
          ui.form({ on: { submit: ui.send(One, { id: ui.dom.form('id') }) } }, [
            ui.each(ctx.items, 'id', (item) => ui.input({ type: 'checkbox', name: 'id', value: item.id })),
          ]),
      }),
    )
    const [d] = found(b, ['HZ054'])
    expect(d?.message).toContain('several controls named "id"')
    expect(d?.fix?.patch?.[0]).toMatchObject({ op: 'replace', value: 'formAll' })
  })

  it('HZ033 accepts submit buttons only when every one of them sends the name with an enum value', () => {
    const withLast = (value: string | null) =>
      build(
        ui.view({
          machine: lists,
          render: () =>
            ui.form(
              { on: { submit: ui.send(Bulk, { ids: ui.dom.formAll('ids'), action: ui.dom.form('action') }) } },
              [
                ui.input({ type: 'checkbox', name: 'ids', value: 'a' }),
                ui.button({ type: 'submit', name: 'action', value: 'delete' }, ['Delete']),
                value === null
                  ? ui.button({ type: 'submit' }, ['Other'])
                  : ui.button({ type: 'submit', name: 'action', value }, ['Other']),
              ],
            ),
        }),
      )
    expect(codesOf(withLast('archive'), ['HZ033'])).toEqual([])
    expect(codesOf(withLast('purge'), ['HZ033'])).toEqual(['HZ033'])
    const unnamed = found(withLast(null), ['HZ033'])
    expect(unnamed.map((d) => d.message)).toEqual([
      'ui.dom.form(\'action\') may not be one of "delete", "archive" (f.Bulk.action)',
    ])
    expect(unnamed[0]!.cause).toContain('Not every submit button')
  })

  it('HZ033 accepts a submit button group into a nullable enum when another button posts nothing', () => {
    const b = build(
      ui.view({
        machine: lists,
        render: () =>
          ui.form({ on: { submit: ui.send(Pick, { size: ui.dom.form('size') }) } }, [
            ui.button({ type: 'submit', name: 'size', value: 's' }, ['S']),
            ui.button({ type: 'submit' }, ['None']),
          ]),
      }),
    )
    expect(codesOf(b, ['HZ033'])).toEqual([])
  })

  it('HZ033 on a boolean fed by a form is form-safe: after its patch no HZ027, HZ033 or HZ036 remains', () => {
    const b = build(
      ui.view({
        machine: lists,
        render: () =>
          ui.form({ on: { submit: ui.send(Remember, { remember: ui.dom.form('remember') }) } }, [
            ui.input({ type: 'checkbox', name: 'remember' }),
          ]),
      }),
    )
    const [d] = found(b, ['HZ033'])
    expect(d?.fix?.summary).toContain("ui.dom.formAll('remember')")
    const fixed = applyPatch(b.ir, d!.fix!.patch!)
    expect(
      validate(fixed).filter((x) => ['HZ027', 'HZ033', 'HZ036', 'HZ054', 'HZ055'].includes(x.code)),
    ).toEqual([])
  })

  it('HZ036 treats formAll and the submitter as server-runnable', () => {
    const b = build(
      ui.view({
        machine: lists,
        render: () =>
          ui.form(
            { on: { submit: ui.send(Bulk, { ids: ui.dom.formAll('ids'), action: ui.dom.form('action') }) } },
            [
              ui.input({ type: 'checkbox', name: 'ids', value: 'a' }),
              ui.button({ type: 'submit', name: 'action', value: 'delete' }, ['Delete']),
            ],
          ),
      }),
    )
    expect(codesOf(b, ['HZ036'])).toEqual([])
  })
})

describe('ADR 0043 C formRef', () => {
  it('controls outside the form join it through the formRef, also from inside ui.each', () => {
    const bulk = ui.formRef()
    const b = build(
      ui.view({
        machine: lists,
        render: ({ ctx }) =>
          ui.div({}, [
            ui.form(
              {
                ref: bulk,
                on: { submit: ui.send(Bulk, { ids: ui.dom.formAll('ids'), action: ui.dom.form('action') }) },
              },
              [
                ui.button({ type: 'submit', name: 'action', value: 'delete' }, ['Delete']),
                ui.button({ type: 'submit', name: 'action', value: 'archive' }, ['Archive']),
              ],
            ),
            ui.ul({}, [
              ui.each(ctx.items, 'id', (item) =>
                ui.li({}, [ui.input({ type: 'checkbox', form: bulk, name: 'ids', value: item.id })]),
              ),
            ]),
          ]),
      }),
      { bulk },
    )
    expect(found(b, ['HZ007', 'HZ014', 'HZ033', 'HZ036', 'HZ054', 'HZ055'])).toEqual([])
    const root = b.ir.features.f!.views.View!.root as { children: { attrs: Record<string, unknown>; ref?: unknown }[] }
    expect(root.children[0]!.ref).toEqual({ formRef: 'f.View/0' })
    expect(root.children[0]!.attrs.id).toEqual({ formRef: 'f.View/0' })
    expect(JSON.stringify(root.children[1])).toContain('"form":{"formRef":"f.View/0"}')
  })

  it('reading one value of the formRef checkboxes is HZ054', () => {
    const bulk = ui.formRef()
    const b = build(
      ui.view({
        machine: lists,
        render: ({ ctx }) =>
          ui.div({}, [
            ui.form({ ref: bulk, on: { submit: ui.send(One, { id: ui.dom.form('ids') }) } }, []),
            ui.each(ctx.items, 'id', (item) =>
              ui.input({ type: 'checkbox', form: bulk, name: 'ids', value: item.id }),
            ),
          ]),
      }),
    )
    expect(codesOf(b, ['HZ054'])).toEqual(['HZ054'])
  })

  it('inside ui.each a formRef has one id per item key', () => {
    const bulk = ui.formRef()
    const b = build(
      ui.view({
        machine: lists,
        render: ({ ctx }) =>
          ui.each(ctx.items, 'id', (item) =>
            ui.div({}, [
              ui.form({ ref: bulk, on: { submit: ui.send(One, { id: ui.dom.form('id') }) } }, []),
              ui.input({ type: 'hidden', form: bulk, name: 'id', value: item.id }),
            ]),
          ),
      }),
    )
    expect(found(b, ['HZ007', 'HZ014', 'HZ055'])).toEqual([])
    const item = (b.ir.features.f!.views.View!.root as { item: { children: { attrs: { form?: unknown } }[] } })
      .item
    expect(item.children[1]!.attrs.form).toEqual({
      fn: '%concat',
      arg: {
        object: {
          0: { formRef: 'f.View/item/0' },
          1: { literal: '~' },
          2: { ref: 'binding', depth: 0, path: ['id'] },
        },
      },
    })
  })

  it('a control outside the ui.each item of its form is HZ014', () => {
    const bulk = ui.formRef()
    const b = build(
      ui.view({
        machine: lists,
        render: ({ ctx }) =>
          ui.div({}, [
            ui.each(ctx.items, 'id', () =>
              ui.form({ ref: bulk, on: { submit: ui.send(One, { id: ui.dom.form('id') }) } }, []),
            ),
            ui.input({ type: 'hidden', form: bulk, name: 'id', value: 'x' }),
          ]),
      }),
    )
    expect(found(b, ['HZ014']).map((d) => d.message)).toEqual([
      'A control may refer to a formRef only from inside the ui.each item of its form',
    ])
  })

  it('a formRef that no form holds is HZ007', () => {
    const loose = ui.formRef()
    const b = build(
      ui.view({
        machine: lists,
        render: () => ui.input({ type: 'hidden', form: loose, name: 'id', value: 'x' }),
      }),
    )
    expect(codesOf(b, ['HZ007'])).toEqual(['HZ007'])
  })

  it('a string form attribute is HZ014 with a patch that introduces a formRef', () => {
    const b = build(
      ui.view({
        machine: lists,
        render: () =>
          ui.div({}, [
            ui.form({ id: 'bulk', on: { submit: ui.send(One, { id: ui.dom.form('id') }) } }, []),
            ui.input({ type: 'hidden', form: 'bulk' as never, name: 'id', value: 'x' }),
          ]),
      }),
    )
    const [d] = found(b, ['HZ014'])
    expect(d?.message).toBe("form: 'bulk' is a string reference to a form")
    const fixed = applyPatch(b.ir, d!.fix!.patch!)
    const root = fixed.features.f!.views.View!.root as {
      children: { attrs: Record<string, unknown>; ref?: unknown }[]
    }
    expect(root.children[0]!.ref).toEqual({ formRef: 'f.View/0' })
    expect(root.children[1]!.attrs.form).toEqual({ formRef: 'f.View/0' })
    expect(validate(fixed).filter((x) => ['HZ055', 'HZ007'].includes(x.code))).toEqual([])
  })
})
