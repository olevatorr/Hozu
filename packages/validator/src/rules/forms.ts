import {
  type At,
  at,
  type FeatureIR,
  formRunnable,
  type Json,
  type JsonPatchOp,
  type JsonSchema,
  join,
  type ProjectIR,
  resolveAt,
  type ValueExpr,
} from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { eventSchema } from '../env.ts'
import { resolveRef } from '../resolve.ts'
import { resolvePath } from '../schema.ts'
import { closest, didYouMean } from '../suggest.ts'
import { walkView } from '../walk.ts'
import { type FormModel, formReads, formsOf, multiValued } from './form-model.ts'

const fieldsOf = (payload: ValueExpr) =>
  ('object' in payload ? Object.keys(payload.object) : ['title'])
    .map((k) => `${k}: ui.dom.form('${k}')`)
    .join(', ')

export function progressiveForms(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'el' || node.tag !== 'form' || !node.on.submit) return
        if (formRunnable(node.on.submit.payload)) return
        ctx.report(
          'HZ036',
          f.id,
          at(pointer, 'on', 'submit', 'payload'),
          `This form only works with JavaScript: its ${node.on.submit.event} payload reads values the server cannot see`,
          'Without JavaScript the browser posts the named form fields and the pressed submit button; the server can use those, context, params and search, but not other DOM fields or each/query bindings.',
          {
            summary:
              "Read the fields with ui.dom.form('name') or ui.dom.formAll('name') so the form also works before hydration and without JavaScript",
            snippet: `on: { submit: ui.send(${node.on.submit.event.split('.').pop()}, { ${fieldsOf(node.on.submit.payload)} }) }`,
            patch: null,
          },
        )
      })
}

const obj = (v: Json | undefined): JsonSchema | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonSchema) : null

export const isList = (s: JsonSchema | null): boolean => {
  if (!s) return false
  const t = s.type
  if (t === 'array' || (Array.isArray(t) && t.includes('array')) || obj(s.items)) return true
  return (['anyOf', 'oneOf'] as const).some(
    (k) => Array.isArray(s[k]) && (s[k] as Json[]).some((v) => isList(obj(v))),
  )
}

const limits = [
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
]

function constraints(s: JsonSchema, found: [JsonSchema, string][] = []): [JsonSchema, string][] {
  for (const k of limits) if (k in s) found.push([s, k])
  for (const k of ['anyOf', 'oneOf'] as const)
    if (Array.isArray(s[k])) for (const v of s[k] as Json[]) if (obj(v)) constraints(obj(v)!, found)
  const items = obj(s.items)
  if (items) constraints(items, found)
  return found
}

function pathTo(node: Json, target: object, tokens: string[] = []): string[] | null {
  if (node === target) return tokens
  if (!node || typeof node !== 'object') return null
  for (const [k, v] of Object.entries(node)) {
    const hit = pathTo(v as Json, target, [...tokens, k])
    if (hit) return hit
  }
  return null
}

const sharedSchema = (f: FeatureIR, hash: string, event: string) =>
  Object.values(f.queries).some((q) => q.input === hash) ||
  Object.values(f.mutations).some((m) => m.input === hash) ||
  Object.values(f.endpoints).some((e) => e.input === hash) ||
  Object.entries(f.events).some(([sym, e]) => `${f.id}.${sym}` !== event && e.payload === hash)

/** The IR pointer of a schema inside an event payload, when no effect shares that payload schema. */
export function schemaPointer(ir: ProjectIR, event: string, target: JsonSchema): string | null {
  const owner = resolveRef(ir, event, 'event')
  const hash = owner?.feature.events[owner.symbol]?.payload
  if (!owner || !hash || sharedSchema(owner.feature, hash, event)) return null
  const tokens = pathTo(owner.feature.schemas[hash]!, target)
  return tokens ? join('', 'features', owner.feature.id, 'schemas', hash, ...tokens) : null
}

function submitButtons(ctx: Ctx, f: FeatureIR, form: FormModel) {
  for (const c of form.controls) {
    if (!c.submit || !c.node.on.click) continue
    ctx.report(
      'HZ056',
      f.id,
      at(c.pointer, 'on', 'click'),
      `A submit button sends ${c.node.on.click.event} on click, and its form submits as well`,
      'The click runs first and the form submit follows (with JavaScript, and as a native post without it), so both events reach the machine.',
      {
        summary:
          "Give the button name and value and read ui.dom.form('action') in the form's submit, or make it type: 'button'",
        snippet: "ui.button({ type: 'submit', name: 'action', value: 'archive' }, ['Archive'])",
        patch: [{ op: 'add', path: resolveAt(at(c.pointer, 'attrs', 'type')), value: { literal: 'button' } }],
      },
    )
  }
}

export function formFields(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const form of formsOf(f)) {
      submitButtons(ctx, f, form)
      const submit = form.node.on.submit
      if (!submit) continue
      const root = eventSchema(ir, submit.event)
      const names = [...new Set(form.controls.map((c) => c.name).filter((n): n is string => n !== null))]
      for (const read of formReads(submit.payload, at(form.pointer, 'on', 'submit', 'payload'))) {
        const source = `ui.dom.${read.kind}('${read.name}')`
        if (!names.includes(read.name)) {
          const guess = closest(read.name, names)
          ctx.report(
            form.opaque ? 'HZ063' : 'HZ055',
            f.id,
            at(read.pointer, 'path', 1),
            `${source}: no control named "${read.name}" belongs to this form.${didYouMean(guess)}`,
            form.opaque
              ? `The form holds ${form.opaque}, whose fields cannot be seen statically. Known fields: ${names.join(', ') || 'none'}.`
              : `A form posts the named controls inside it, the controls whose form attribute holds its formRef, and the pressed submit button. Fields: ${names.join(', ') || 'none'}.`,
            {
              summary: guess ? `Read ${guess}` : `Add a control with name: '${read.name}' to the form`,
              snippet: guess ? null : `ui.input({ name: '${read.name}' })`,
              patch: guess
                ? [{ op: 'replace', path: resolveAt(at(read.pointer, 'path', 1)), value: guess }]
                : null,
            },
          )
          continue
        }
        const r = read.field && root ? resolvePath(root, read.field) : null
        const schema = r?.ok ? r.schema : null
        const field = `${submit.event}.${read.field?.join('.') || 'payload'}`
        if (read.kind === 'form' && (isList(schema) || multiValued(form, read.name)))
          ctx.report(
            'HZ054',
            f.id,
            at(read.pointer, 'path', 0),
            isList(schema)
              ? `${source} reads one value, but ${field} is a list`
              : `${source} reads one value, but several controls named "${read.name}" submit in this form`,
            'ui.dom.form(name) is the first value of the name; a checkbox group, a select with multiple, repeated controls and controls inside ui.each post one value each.',
            {
              summary: `Read every value with ui.dom.formAll('${read.name}') into a list field`,
              snippet: null,
              patch: [{ op: 'replace', path: resolveAt(at(read.pointer, 'path', 0)), value: 'formAll' }],
            },
          )
        if (schema) constrainedPayload(ctx, f, submit.event, schema, source, field, read.pointer)
      }
    }
}

function constrainedPayload(
  ctx: Ctx,
  f: FeatureIR,
  event: string,
  schema: JsonSchema,
  source: string,
  field: string,
  pointer: At,
) {
  const found = constraints(schema)
  if (!found.length) return
  const patch: JsonPatchOp[] = []
  for (const [s, k] of found) {
    const base = schemaPointer(ctx.ir, event, s)
    if (base) patch.push({ op: 'remove', path: join(base, k) })
  }
  ctx.report(
    'HZ061',
    f.id,
    pointer,
    `${source} feeds ${field}, whose schema declares ${[...new Set(found.map(([, k]) => k))].join(', ')}`,
    'A native post checks the event payload and answers 400, while with JavaScript the payload is not checked and the mutation answers Invalid with field errors: the same input behaves differently in the two modes.',
    {
      summary: "Move the limits to the mutation's input schema, where both modes get the same Invalid",
      snippet: `event({ payload: z.object({ ${field.split('.').pop()}: z.string() }) })`,
      patch: patch.length ? patch : null,
    },
  )
}
