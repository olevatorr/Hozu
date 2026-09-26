import { at, formRunnable } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { walkView } from '../walk.ts'

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
          'Without JavaScript the browser posts the named form fields; the server can use those, context, params and search, but not other DOM fields or each/query bindings.',
          {
            summary:
              "Read the fields with ui.dom.form('name') so the form also works before hydration and without JavaScript",
            snippet: null,
            patch: null,
          },
        )
      })
}
