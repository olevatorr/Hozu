import {
  type At,
  at,
  type ElementNode,
  type FeatureIR,
  formRefOf,
  type ValueExpr,
  type ViewNode,
} from '@hozu/core/ir'
import { featurePointer } from '../walk.ts'

export interface Control {
  node: ElementNode
  pointer: At
  chain: string[]
  /** The branches it sits in, as `<node id>:<arm>`: two controls in different arms of one node never render together. */
  arms: string[]
  name: string | null
  submit: boolean
  radio: boolean
}

export interface FormModel {
  node: ElementNode
  pointer: At
  view: string
  chain: string[]
  controls: Control[]
  opaque: string | null
}

export interface FormRead {
  kind: 'form' | 'formAll'
  name: string
  field: string[] | null
  pointer: At
}

const literal = (v: ValueExpr | undefined) =>
  v && 'literal' in v && typeof v.literal === 'string' ? v.literal : null

const controlTags = new Set(['input', 'select', 'textarea', 'button', 'fieldset', 'output', 'object'])

export const isSubmit = (el: ElementNode) =>
  (el.tag === 'button' && (literal(el.attrs.type) ?? 'submit') === 'submit') ||
  (el.tag === 'input' && ['submit', 'image'].includes(literal(el.attrs.type) ?? ''))

const control = (node: ElementNode, pointer: At, chain: string[], arms: string[]): Control => ({
  node,
  pointer,
  chain,
  arms,
  name: node.attrs.name === undefined ? null : literal(node.attrs.name),
  submit: isSubmit(node),
  radio: node.tag === 'input' && literal(node.attrs.type) === 'radio',
})

const models = new WeakMap<FeatureIR, FormModel[]>()

/** Every form of a feature with the controls that belong to it: descendants and formRef controls. */
export function formsOf(feature: FeatureIR): FormModel[] {
  const hit = models.get(feature)
  if (hit) return hit
  const forms: FormModel[] = []
  const external = new Map<string, Control[]>()
  for (const [view, v] of Object.entries(feature.views)) {
    const walk = (n: ViewNode, pointer: At, chain: string[], form: FormModel | null, arms: string[] = []) => {
      switch (n.kind) {
        case 'el': {
          const owner = formRefOf(n.attrs.form)
          if (n.tag === 'form' && !form) {
            const model: FormModel = { node: n, pointer, view, chain, controls: [], opaque: null }
            forms.push(model)
            n.children.forEach((c, i) => walk(c, at(pointer, 'children', i), chain, model, arms))
            return
          }
          if (controlTags.has(n.tag)) {
            const c = control(n, pointer, chain, arms)
            if (owner !== null) external.set(owner, [...(external.get(owner) ?? []), c])
            else if (n.attrs.form === undefined && form) form.controls.push(c)
            if (form && c.name === null && n.attrs.name !== undefined)
              form.opaque ??= 'a control with a computed name'
          }
          n.children.forEach((c, i) => walk(c, at(pointer, 'children', i), chain, form, arms))
          return
        }
        case 'component':
          if (form) form.opaque ??= 'a client component'
          n.children.forEach((c, i) => walk(c, at(pointer, 'children', i), chain, form, arms))
          return
        case 'html':
          if (form) form.opaque ??= 'ui.html'
          return
        case 'embed':
          if (form) form.opaque ??= 'another view'
          return
        case 'when':
          n.children.forEach((c, i) => walk(c, at(pointer, 'children', i), chain, form, arms))
          return
        case 'if':
          n.ifTrue.forEach((c, i) =>
            walk(c, at(pointer, 'ifTrue', i), chain, form, [...arms, `${n.id}:true`]),
          )
          n.ifFalse.forEach((c, i) =>
            walk(c, at(pointer, 'ifFalse', i), chain, form, [...arms, `${n.id}:false`]),
          )
          return
        case 'each':
          walk(n.item, at(pointer, 'item'), [...chain, n.id], form, arms)
          return
        case 'query':
          walk(n.ready, at(pointer, 'ready'), chain, form, [...arms, `${n.id}:ready`])
          if (n.pending) walk(n.pending, at(pointer, 'pending'), chain, form, [...arms, `${n.id}:pending`])
          for (const [name, child] of Object.entries(n.failed))
            walk(child, at(pointer, 'failed', name), chain, form, [...arms, `${n.id}:failed:${name}`])
          return
        default:
          return
      }
    }
    walk(v.root, featurePointer(feature.id, 'views', view, 'root'), [], null)
  }
  for (const f of forms) if (f.node.ref) f.controls.push(...(external.get(f.node.ref.formRef) ?? []))
  models.set(feature, forms)
  return forms
}

/** The ui.dom.form / formAll reads of a submit payload, with the payload field each one feeds. */
export function formReads(payload: ValueExpr, pointer: At): FormRead[] {
  const out: FormRead[] = []
  const visit = (v: ValueExpr, field: string[] | null, p: At) => {
    if ('ref' in v) {
      const [kind, name] = v.path
      if (v.ref === 'dom' && (kind === 'form' || kind === 'formAll') && name !== undefined)
        out.push({ kind, name, field, pointer: p })
    } else if ('object' in v) {
      for (const [k, x] of Object.entries(v.object))
        visit(x, field ? [...field, k] : null, at(p, 'object', k))
    } else if ('fn' in v) visit(v.arg, null, at(p, 'arg'))
  }
  visit(payload, [], pointer)
  return out
}

const multiple = (v: ValueExpr | undefined) =>
  v !== undefined && !('literal' in v && (v.literal === false || v.literal === null))

/** Whether a name can carry several values in one form instance (radio and submit groups excluded). */
export function multiValued(form: FormModel, name: string): boolean {
  const named = form.controls.filter((c) => c.name === name && !c.radio && !c.submit)
  const exclusive = (a: Control, b: Control) =>
    a.arms.some((x) => {
      const node = x.slice(0, x.indexOf(':'))
      return b.arms.some((y) => y !== x && y.slice(0, y.indexOf(':')) === node)
    })
  const together = named.some((a, i) => named.slice(i + 1).some((b) => !exclusive(a, b)))
  return together || named.some((c) => c.chain.length > form.chain.length || multiple(c.node.attrs.multiple))
}
