import { at, componentOf, resolveAt } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { closest, didYouMean } from '../suggest.ts'
import { walkView } from '../walk.ts'

export function componentEmits(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'component') return
        const id = node.use.component
        const c = componentOf(ir, id)
        if (!c) return
        const declared = Object.keys(c.emits)
        for (const name of Object.keys(node.on)) {
          if (declared.includes(name)) continue
          const guess = closest(name, declared)
          ctx.report(
            'HZ029',
            f.id,
            at(pointer, 'on', name),
            `Component ${id} does not emit "${name}".${didYouMean(guess)}`,
            declared.length ? `Declared emits: ${declared.join(', ')}.` : 'The component declares no emits.',
            {
              summary: guess ? `Handle "${guess}"` : 'Declare the event in emits or remove the handler',
              snippet: null,
              patch: guess
                ? [
                    { op: 'add', path: resolveAt(at(pointer, 'on', guess)), value: node.on[name] as never },
                    { op: 'remove', path: resolveAt(at(pointer, 'on', name)) },
                  ]
                : null,
            },
          )
        }
      })
}
