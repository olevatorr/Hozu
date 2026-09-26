import { at, type Json, resolveAt, type TransitionIR, type ViewNode } from '@tenon/core/ir'
import type { Ctx } from '../context.ts'
import { effectSchemas } from '../env.ts'
import { resolveRef } from '../resolve.ts'
import { closest, didYouMean } from '../suggest.ts'
import { featurePointer, walkView } from '../walk.ts'

const required = (errors: Record<string, string>) => [...Object.keys(errors), 'Unexpected']

export function declaredErrors(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features)) {
    const initial = f.machine?.initial ?? ''
    for (const [state, s] of Object.entries(f.machine?.states ?? {})) {
      if (!s.invoke) continue
      const schemas = effectSchemas(ctx.ir, s.invoke.effect)
      if (!schemas) continue
      const names = required(schemas.errors)
      const base = featurePointer(f.id, 'machine', 'states', state, 'invoke', 'failed')
      const template: TransitionIR[] = s.invoke.failed.Unexpected?.length
        ? s.invoke.failed.Unexpected
        : [{ guard: null, target: initial, assign: [], navigate: null }]
      for (const name of names) {
        if (s.invoke.failed[name]?.length) continue
        ctx.report(
          'TN004',
          f.id,
          at(base, name),
          `"${state}" invokes ${s.invoke.effect} but does not handle its "${name}" error`,
          `${s.invoke.effect} declares errors ${names.join(', ')}; every one needs a failed transition.`,
          {
            summary: `Add failed.${name}`,
            snippet: `failed: { ${name}: [{ target: '${template[0]!.target}' }] }`,
            patch: [{ op: 'add', path: resolveAt(at(base, name)), value: template as unknown as Json }],
          },
        )
      }
      for (const name of Object.keys(s.invoke.failed)) {
        if (names.includes(name) || (name === 'Invalid' && schemas.invalid)) continue
        const guess = closest(name, names)
        ctx.report(
          'TN007',
          f.id,
          at(base, name),
          `${s.invoke.effect} has no error "${name}".${didYouMean(guess)}`,
          `Declared errors: ${names.join(', ')}.`,
          {
            summary: 'Remove the handler',
            snippet: null,
            patch: [{ op: 'remove', path: resolveAt(at(base, name)) }],
          },
        )
      }
    }
    for (const [vid, view] of Object.entries(f.views))
      walkView(ctx.ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'query') return
        const r = resolveRef(ctx.ir, node.query, 'query')
        if (!r) return
        const names = required(r.feature.queries[r.symbol]!.errors)
        for (const name of names) {
          if (node.failed[name]) continue
          const template: ViewNode = node.failed.Unexpected ?? {
            id: `${node.id}/failed/${name}`,
            kind: 'text',
            value: { literal: '' },
          }
          ctx.report(
            'TN004',
            f.id,
            at(pointer, 'failed', name),
            `Query ${node.query} can fail with "${name}" but the view does not render it`,
            `Declared errors: ${names.join(', ')}.`,
            {
              summary: `Add failed.${name}`,
              snippet: `failed: { ${name}: () => ui.p({}, ['…']) }`,
              patch: [
                {
                  op: 'add',
                  path: resolveAt(at(pointer, 'failed', name)),
                  value: template as unknown as Json,
                },
              ],
            },
          )
        }
        for (const name of Object.keys(node.failed))
          if (!names.includes(name))
            ctx.report(
              'TN007',
              f.id,
              at(pointer, 'failed', name),
              `${node.query} has no error "${name}"`,
              `Declared errors: ${names.join(', ')}.`,
              {
                summary: 'Remove the branch',
                snippet: null,
                patch: [{ op: 'remove', path: resolveAt(at(pointer, 'failed', name)) }],
              },
            )
      })
    for (const [cid, c] of Object.entries(f.contracts))
      c.when.forEach((step, i) => {
        if (!('failed' in step)) return
        const schemas = effectSchemas(ctx.ir, step.failed)
        if (!schemas) return
        const names = required(schemas.errors)
        if (names.includes(step.error) || (step.error === 'Invalid' && schemas.invalid)) return
        const guess = closest(step.error, names)
        const p = featurePointer(f.id, 'contracts', cid, 'when', i, 'error')
        ctx.report(
          'TN007',
          f.id,
          p,
          `${step.failed} has no error "${step.error}".${didYouMean(guess)}`,
          `Declared errors: ${names.join(', ')}.`,
          {
            summary: guess ? `Use "${guess}"` : 'Use a declared error',
            snippet: null,
            patch: guess ? [{ op: 'replace', path: resolveAt(p), value: guess }] : null,
          },
        )
      })
  }
}
