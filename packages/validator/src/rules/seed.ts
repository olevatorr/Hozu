import type { Ctx } from '../context.ts'
import { schemaIn } from '../env.ts'
import { featurePointer } from '../walk.ts'

export function seed(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features))
    for (const [sym, v] of Object.entries(f.views)) {
      if (!v.seed || !f.machine) continue
      const context = schemaIn(f, f.machine.context as unknown as string) as { properties?: object } | null
      if (!context) continue
      const fields = Object.keys(context.properties ?? {})
      for (const key of Object.keys(v.seed))
        if (!fields.includes(key))
          ctx.report(
            'HZ048',
            f.id,
            featurePointer(f.id, 'views', sym, 'seed', key),
            `seed sets "${key}", which is not a context field of ${f.id}`,
            'seed replaces top-level fields of initialContext.',
            { summary: `Seed one of: ${fields.join(', ')}`, snippet: null, patch: null },
          )
    }
  for (const [route, page] of Object.entries(ctx.ir.pages)) {
    const byMachine = new Map<string, string[]>()
    for (const ref of page.views) {
      const dot = ref.indexOf('.')
      const view = ctx.ir.features[ref.slice(0, dot)]?.views[ref.slice(dot + 1)]
      if (view?.seed && view.machine)
        byMachine.set(view.machine, [...(byMachine.get(view.machine) ?? []), ref])
    }
    for (const [machine, views] of byMachine)
      if (views.length > 1)
        ctx.report(
          'HZ048',
          machine,
          featurePointer(machine, 'views', views[1]!.slice(views[1]!.indexOf('.') + 1), 'seed'),
          `Page ${route} lists ${views.join(' and ')}, which both seed the ${machine} machine`,
          'A page creates one machine per feature, so only one of its views may seed it.',
          { summary: `Keep seed on one view (${views[0]})`, snippet: null, patch: null },
        )
  }
}
