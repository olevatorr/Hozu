import {
  type At,
  at,
  type ElementNode,
  type Json,
  type JsonPatchOp,
  type JsonSchema,
  resolveAt,
  type ValueExpr,
  type ViewNode,
} from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { eventSchema, schemaIn } from '../env.ts'
import { itemsOf, resolvePath } from '../schema.ts'
import { walkView } from '../walk.ts'
import { type FormModel, formsOf } from './form-model.ts'
import { schemaPointer } from './forms.ts'

const obj = (v: Json | undefined): JsonSchema | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonSchema) : null

function choices(s: JsonSchema): string[] | null {
  if ('const' in s) return typeof s.const === 'string' ? [s.const] : null
  if (Array.isArray(s.enum)) return s.enum.filter((e): e is string => typeof e === 'string')
  for (const k of ['anyOf', 'oneOf'] as const)
    if (Array.isArray(s[k])) {
      const parts = (s[k] as Json[]).map(obj).filter((x): x is JsonSchema => x !== null && x.type !== 'null')
      const all = parts.map(choices)
      if (all.length && all.every((c) => c !== null)) return all.flat() as string[]
    }
  return null
}

const kindOf = (s: JsonSchema): 'choice' | 'number' | 'boolean' | 'text' => {
  if (choices(s)) return 'choice'
  const types = typeof s.type === 'string' ? [s.type] : Array.isArray(s.type) ? (s.type as string[]) : []
  if (types.includes('number') || types.includes('integer')) return 'number'
  if (types.includes('boolean')) return 'boolean'
  for (const k of ['anyOf', 'oneOf'] as const)
    if (Array.isArray(s[k]))
      for (const v of s[k] as Json[]) {
        const o = obj(v)
        if (o && o.type !== 'null') return kindOf(o)
      }
  return 'text'
}

function descendants(node: ViewNode, visit: (el: ElementNode) => void): boolean {
  let fixed = true
  const walk = (n: ViewNode) => {
    if (n.kind === 'el') {
      visit(n)
      n.children.forEach(walk)
    } else if (n.kind === 'when') n.children.forEach(walk)
    else if (n.kind === 'if') [...n.ifTrue, ...n.ifFalse].forEach(walk)
    else if (n.kind === 'each' || n.kind === 'query') fixed = false
  }
  walk(node)
  return fixed
}

const literal = (v: ValueExpr | undefined) =>
  v && 'literal' in v && typeof v.literal === 'string' ? v.literal : null

function optionsOf(control: ElementNode): { values: string[]; fixed: boolean } {
  const values: string[] = []
  const fixed = descendants(control, (el) => {
    if (el.tag !== 'option') return
    const text =
      el.children.length === 1 && el.children[0]!.kind === 'text' ? literal(el.children[0]!.value) : null
    const v = literal(el.attrs.value) ?? text
    if (v !== null) values.push(v)
  })
  return { values, fixed }
}

const nullable = (s: JsonSchema): boolean => {
  const t = s.type
  if (t === 'null' || (Array.isArray(t) && t.includes('null'))) return true
  return (['anyOf', 'oneOf'] as const).some(
    (k) =>
      Array.isArray(s[k]) &&
      (s[k] as Json[]).some((v) => {
        const o = obj(v)
        return o !== null && nullable(o)
      }),
  )
}

interface Named {
  values: string[]
  fixed: boolean
  found: boolean
  unnamed: boolean
}

function namedChoices(
  form: FormModel | undefined,
  name: string,
  context: (path: string[]) => JsonSchema | null,
): Named {
  const out: Named = { values: [], fixed: true, found: false, unnamed: false }
  if (!form) return out
  const submits = form.controls.filter((c) => c.submit)
  for (const c of form.controls) {
    if (c.name !== name) continue
    out.found = true
    const el = c.node
    if (el.tag === 'select') {
      const o = optionsOf(el)
      out.values.push(...o.values)
      out.fixed &&= o.fixed
    } else if (c.radio || c.submit || (el.tag === 'input' && literal(el.attrs.type) === 'checkbox')) {
      const v = literal(el.attrs.value) ?? (c.submit ? null : el.attrs.value === undefined ? 'on' : null)
      if (v === null) out.fixed = false
      else out.values.push(v)
    } else {
      const v = el.attrs.value
      const own =
        el.tag === 'input' && literal(el.attrs.type) === 'hidden' && v && 'ref' in v && v.ref === 'context'
          ? context(v.path)
          : null
      const listed = own ? choices(own) : null
      if (listed) out.values.push(...listed)
      else out.fixed = false
    }
  }
  out.unnamed =
    submits.some((c) => c.name === name) &&
    submits.some((c) => c.name !== name || literal(c.node.attrs.value) === null)
  return out
}

const nullablePatch = (path: string | null, schema: JsonSchema): JsonPatchOp[] | null =>
  path === null ? null : [{ op: 'replace', path, value: { anyOf: [schema, { type: 'null' }] } }]

const quoted = (xs: string[]) => xs.map((x) => `"${x}"`).join(', ')

export function domText(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features)) {
    const forms = formsOf(f)
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'el') return
        const form = forms.find((m) => m.node === node)
        for (const [dom, send] of Object.entries(node.on)) {
          const root = eventSchema(ir, send.event)
          const visit = (v: ValueExpr, path: string[], p: At) => {
            if ('object' in v) {
              for (const [k, x] of Object.entries(v.object)) visit(x, [...path, k], at(p, 'object', k))
              return
            }
            if (!('ref' in v) || v.ref !== 'dom') return
            const kindOfRead = v.path[0]
            if (kindOfRead !== 'value' && kindOfRead !== 'form' && kindOfRead !== 'formAll') return
            const r = resolvePath(root, path)
            const resolved = r.ok ? r.schema : null
            const schema = kindOfRead === 'formAll' ? itemsOf(resolved) : resolved
            if (!schema || !resolved) return
            const kind = kindOf(schema)
            if (kind === 'text') return
            const name = v.path[1] ?? ''
            const field = path.join('.') || 'payload'
            const source = kindOfRead === 'value' ? 'ui.dom.value' : `ui.dom.${kindOfRead}('${name}')`
            const report = (
              message: string,
              cause: string,
              summary: string,
              patch: JsonPatchOp[] | null = null,
            ) => ctx.report('HZ033', f.id, p, message, cause, { summary, snippet: null, patch })
            if (kind === 'number' || kind === 'boolean') {
              const noun = kind === 'number' ? 'a number' : 'a boolean'
              if (kindOfRead === 'value') {
                report(
                  `${source} is text, but ${send.event}.${field} is ${noun}`,
                  `DOM values are strings; ${noun} field would receive text.`,
                  kind === 'number'
                    ? 'Send ui.dom.valueAsNumber from the input’s own event instead'
                    : 'Send ui.dom.checked from the input’s own change event instead',
                )
                return
              }
              const at0 = resolveAt(at(p, 'path', 0))
              const target = schemaPointer(ir, send.event, resolved)
              report(
                `${source} is text, but ${send.event}.${field} is ${kindOfRead === 'formAll' ? `a list of ${kind}s` : noun}`,
                kind === 'number'
                  ? 'A form posts text; parse it where the input is checked, so both modes get the same Invalid.'
                  : 'A form posts a checkbox only while it is checked, and as the text "on".',
                kind === 'number'
                  ? `Send the text (z.string()) and parse it in the mutation input (z.coerce.number())`
                  : `Read ui.dom.formAll('${name}') into a list field (checked = ['on']), or use a literal radio pair`,
                target === null
                  ? null
                  : kind === 'number'
                    ? [
                        {
                          op: 'replace',
                          path: target,
                          value:
                            kindOfRead === 'formAll'
                              ? { type: 'array', items: { type: 'string' } }
                              : { type: 'string' },
                        },
                      ]
                    : [
                        { op: 'replace', path: at0, value: 'formAll' },
                        { op: 'replace', path: target, value: { type: 'array', items: { type: 'string' } } },
                      ],
              )
              return
            }
            const allowed = choices(schema)!
            const found: Named =
              kindOfRead === 'value'
                ? node.tag === 'select'
                  ? { ...optionsOf(node), found: true, unnamed: false }
                  : { values: [], fixed: false, found: false, unnamed: false }
                : namedChoices(form, name, (path) => {
                    const r = resolvePath(schemaIn(f, f.machine?.context), path)
                    return r.ok ? r.schema : null
                  })
            const outside = found.values.filter((x) => !allowed.includes(x))
            const unnamed = found.unnamed && kindOfRead === 'form' && !nullable(resolved)
            if (found.found && found.fixed && !outside.length && found.values.length && !unnamed) return
            report(
              `${source} may not be one of ${quoted(allowed)} (${send.event}.${field})`,
              !found.found
                ? kindOfRead === 'value'
                  ? 'Only a <select> guarantees its value; free text can be anything.'
                  : `No select, radio group, checkbox or submit button named "${name}" was found in this form.`
                : outside.length
                  ? `These option values are not allowed: ${quoted(outside)}.`
                  : unnamed
                    ? `Not every submit button of this form sends "${name}" with a literal value, so pressing another one, or Enter, posts no "${name}".`
                    : 'The options are not all literal, so they cannot be checked.',
              unnamed
                ? `Give every submit button name: '${name}' and a literal value from ${quoted(allowed)}, or make ${send.event}.${field} nullable`
                : `Use a <select>, radio inputs or submit buttons whose literal values are exactly ${quoted(allowed)}`,
              unnamed && !outside.length && found.fixed
                ? nullablePatch(schemaPointer(ir, send.event, resolved), resolved)
                : null,
            )
          }
          visit(send.payload, [], at(pointer, 'on', dom, 'payload'))
        }
      })
  }
}
