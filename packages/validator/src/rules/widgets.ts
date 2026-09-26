import { at, resolveAt } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { resolveRef } from '../resolve.ts'
import { closest, didYouMean } from '../suggest.ts'
import { walkView } from '../walk.ts'

export function widgetEvents(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'widget') return
        const r = resolveRef(ir, node.widget, 'widget')
        const declared = r ? Object.keys(r.feature.widgets[r.symbol]!.events) : null
        if (!declared) return
        for (const name of Object.keys(node.on)) {
          if (declared.includes(name)) continue
          const guess = closest(name, declared)
          ctx.report(
            'HZ029',
            f.id,
            at(pointer, 'on', name),
            `Widget ${node.widget} does not emit "${name}".${didYouMean(guess)}`,
            declared.length ? `Declared events: ${declared.join(', ')}.` : 'The widget declares no events.',
            {
              summary: guess ? `Handle "${guess}"` : 'Declare the event on the widget or remove the handler',
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
