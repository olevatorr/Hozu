import {
  type At,
  at,
  type ElementNode,
  type Json,
  type JsonSchema,
  type ValueExpr,
  type ViewNode,
} from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { eventSchema } from '../env.ts'
import { resolvePath } from '../schema.ts'
import { walkView } from '../walk.ts'

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

function namedChoices(form: ElementNode, name: string): { values: string[]; fixed: boolean; found: boolean } {
  const values: string[] = []
  let found = false
  let fixed = true
  descendants(form, (el) => {
    if (literal(el.attrs.name) !== name) return
    found = true
    if (el.tag === 'select') {
      const o = optionsOf(el)
      values.push(...o.values)
      fixed &&= o.fixed
    } else if (el.tag === 'input' && literal(el.attrs.type) === 'radio') {
      const v = literal(el.attrs.value)
      if (v === null) fixed = false
      else values.push(v)
    } else fixed = false
  })
  return { values, fixed, found }
}

export function domText(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'el') return
        for (const [dom, send] of Object.entries(node.on)) {
          const root = eventSchema(ir, send.event)
          const visit = (v: ValueExpr, path: string[], p: At) => {
            if ('object' in v) {
              for (const [k, x] of Object.entries(v.object)) visit(x, [...path, k], at(p, 'object', k))
              return
            }
            if (!('ref' in v) || v.ref !== 'dom' || (v.path[0] !== 'value' && v.path[0] !== 'form')) return
            const r = resolvePath(root, path)
            const schema = r.ok ? r.schema : null
            if (!schema) return
            const kind = kindOf(schema)
            if (kind === 'text') return
            const field = path.join('.') || 'payload'
            const source = v.path[0] === 'form' ? `ui.dom.form('${v.path[1]}')` : 'ui.dom.value'
            const report = (message: string, cause: string, summary: string) =>
              ctx.report('HZ033', f.id, p, message, cause, { summary, snippet: null, patch: null })
            if (kind === 'number') {
              report(
                `${source} is text, but ${send.event}.${field} is a number`,
                'DOM values are strings; a number field would receive text.',
                'Send ui.dom.valueAsNumber from the input’s own event instead',
              )
              return
            }
            if (kind === 'boolean') {
              report(
                `${source} is text, but ${send.event}.${field} is a boolean`,
                'DOM values are strings; a boolean field would receive text.',
                'Send ui.dom.checked instead',
              )
              return
            }
            const allowed = choices(schema)!
            const found =
              v.path[0] === 'form'
                ? namedChoices(node, v.path[1] ?? '')
                : node.tag === 'select'
                  ? { ...optionsOf(node), found: true }
                  : { values: [], fixed: false, found: false }
            const outside = found.values.filter((x) => !allowed.includes(x))
            if (found.found && found.fixed && !outside.length && found.values.length) return
            report(
              `${source} may not be one of ${allowed.map((x) => `"${x}"`).join(', ')} (${send.event}.${field})`,
              !found.found
                ? v.path[0] === 'form'
                  ? `No select or radio group named "${v.path[1]}" was found in this form.`
                  : 'Only a <select> guarantees its value; free text can be anything.'
                : outside.length
                  ? `These option values are not allowed: ${outside.map((x) => `"${x}"`).join(', ')}.`
                  : 'The options are not all literal, so they cannot be checked.',
              `Use a <select> (or radio inputs) whose literal option values are exactly ${allowed.map((x) => `"${x}"`).join(', ')}`,
            )
          }
          visit(send.payload, [], at(pointer, 'on', dom, 'payload'))
        }
      })
}
