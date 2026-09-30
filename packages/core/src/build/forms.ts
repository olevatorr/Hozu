import { operatorFns } from '../builders/operators.ts'
import { type At, at, resolveAt } from '../canonical/pointer.ts'
import type { FormRefIR, ValueExpr } from '../ir/types.ts'
import type { FeatureScope } from './scope.ts'

interface Level {
  id: string
  depth: number
  key: string | null
}

interface Owner {
  id: string
  chain: Level[]
  at: At
}

interface Use {
  ref: object | string
  chain: Level[]
  at: At
  set: (v: ValueExpr) => void
}

interface Forms {
  chain: Level[]
  owners: Map<object, Owner>
  literal: Map<string, Owner>
  uses: Use[]
}

const state = new WeakMap<FeatureScope, Forms>()

const formsOf = (scope: FeatureScope): Forms => {
  let s = state.get(scope)
  if (!s) {
    s = { chain: [], owners: new Map(), literal: new Map(), uses: [] }
    state.set(scope, s)
  }
  return s
}

const SNIPPET =
  "const bulk = ui.formRef()\nui.form({ ref: bulk, on: { submit: … } }, [...])\nui.input({ type: 'checkbox', form: bulk, name: 'ids', value: item.id })"

export function inEach<T>(scope: FeatureScope, level: Level, run: () => T): T {
  const s = formsOf(scope)
  s.chain.push(level)
  try {
    return run()
  } finally {
    s.chain.pop()
  }
}

/** The rendered id of a formRef: the form's node id, plus the item key of every enclosing ui.each. */
export function formIdValue(scope: FeatureScope, id: string, chain: readonly Level[]): ValueExpr {
  const ref: FormRefIR = { formRef: id }
  if (!chain.length) return ref
  scope.project.bindings.fns['%concat'] = operatorFns['%concat']!
  const object: Record<string, ValueExpr> = { 0: ref }
  chain.forEach((l, i) => {
    object[2 * i + 1] = { literal: '~' }
    object[2 * i + 2] = { ref: 'binding', depth: l.depth, path: l.key === null ? [] : [l.key] }
  })
  return { fn: '%concat', arg: { object } }
}

export function holdForm(scope: FeatureScope, ref: object, id: string, p: At): ValueExpr {
  const s = formsOf(scope)
  const chain = [...s.chain]
  if (s.owners.has(ref))
    scope.report(
      'HZ014',
      at(p, 'ref'),
      'This formRef is already held by another form',
      'A formRef names one form; declare one ui.formRef() per form.',
    )
  else s.owners.set(ref, { id, chain, at: p })
  return formIdValue(scope, id, chain)
}

export function literalForm(scope: FeatureScope, value: string, id: string, p: At) {
  const s = formsOf(scope)
  s.literal.set(value, { id, chain: [...s.chain], at: p })
}

export function formUse(scope: FeatureScope, ref: object | string, p: At, set: (v: ValueExpr) => void) {
  const s = formsOf(scope)
  s.uses.push({ ref, chain: [...s.chain], at: p, set })
}

const within = (form: Level[], control: Level[]) =>
  form.length <= control.length && form.every((l, i) => l.id === control[i]!.id)

export function finishForms(scope: FeatureScope) {
  const s = state.get(scope)
  if (!s) return
  state.delete(scope)
  for (const use of s.uses) {
    const ap = at(use.at, 'attrs', 'form')
    if (typeof use.ref === 'string') {
      const owner = s.literal.get(use.ref)
      const value = owner && within(owner.chain, use.chain) ? formIdValue(scope, owner.id, owner.chain) : null
      scope.report(
        'HZ014',
        ap,
        `form: '${use.ref}' is a string reference to a form`,
        'Controls outside a form refer to it by a declared identity, so a renamed or missing form cannot go unnoticed.',
        {
          summary:
            'Declare const bulk = ui.formRef(), hold it with ui.form({ ref: bulk }) and pass form: bulk',
          snippet: SNIPPET,
          patch:
            owner && value
              ? [
                  { op: 'replace', path: resolveAt(ap), value },
                  { op: 'add', path: resolveAt(at(owner.at, 'ref')), value: { formRef: owner.id } },
                  { op: 'replace', path: resolveAt(at(owner.at, 'attrs', 'id')), value },
                ]
              : null,
        },
      )
      continue
    }
    const owner = s.owners.get(use.ref)
    if (!owner) {
      scope.report(
        'HZ007',
        ap,
        'No form of this feature holds this formRef',
        'A formRef gets its id from the form that holds it: ui.form({ ref: bulk }).',
        { summary: 'Hold the formRef on the form: ui.form({ ref: bulk, … })', snippet: SNIPPET, patch: null },
      )
      continue
    }
    if (!within(owner.chain, use.chain)) {
      scope.report(
        'HZ014',
        ap,
        'A control may refer to a formRef only from inside the ui.each item of its form',
        'Inside ui.each a formRef has one id per item key, so a control outside that item cannot name one form.',
        {
          summary: 'Move the control into the same ui.each item as the form, or the form out of the ui.each',
          snippet: null,
          patch: null,
        },
      )
      continue
    }
    use.set(formIdValue(scope, owner.id, owner.chain))
  }
}
