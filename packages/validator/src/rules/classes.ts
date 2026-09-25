import { type At, at, type Fix, motionClasses, resolveAt } from '@tenon/core/ir'
import type { Ctx } from '../context.ts'
import { didYouMean } from '../suggest.ts'
import { walkView } from '../walk.ts'

type Patch = NonNullable<Fix['patch']>

const tokens = (value: string) => value.split(/\s+/).filter(Boolean)

export function classNames(ctx: Ctx) {
  const unknown = ctx.unknownClasses
  if (!unknown?.size) return
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if ((node.kind === 'when' || node.kind === 'each' || node.kind === 'if') && node.motion) {
          if (motionClasses(node.motion).every((c) => unknown.has(c)))
            ctx.report(
              'TN026',
              f.id,
              at(pointer, 'motion'),
              `Motion "${node.motion}" has no CSS`,
              `Define at least ${node.motion}-enter-active / ${node.motion}-leave-active (and optionally -from, -to, -move) in a stylesheet.`,
              {
                summary: `Add transition classes for "${node.motion}"`,
                snippet: `.${node.motion}-enter-active, .${node.motion}-leave-active { transition: opacity 200ms; }\n.${node.motion}-enter-from, .${node.motion}-leave-to { opacity: 0; }`,
                patch: null,
              },
            )
          return
        }
        if (node.kind !== 'el' && node.kind !== 'widget') return
        const lists: [string, At, (fixed: string) => Patch][] = []
        if (node.class)
          lists.push([
            node.class,
            at(pointer, 'class'),
            (fixed) => [{ op: 'replace', path: resolveAt(at(pointer, 'class')), value: fixed }],
          ])
        for (const key of Object.keys(node.toggle))
          lists.push([
            key,
            at(pointer, 'toggle', key),
            (fixed) => [
              { op: 'add', path: resolveAt(at(pointer, 'toggle', fixed)), value: node.toggle[key]! },
              { op: 'remove', path: resolveAt(at(pointer, 'toggle', key)) },
            ],
          ])
        for (const [value, p, patch] of lists) {
          const bad = tokens(value).filter((c) => unknown.has(c))
          if (!bad.length) continue
          const fixes = bad.map((c) => unknown.get(c) ?? null)
          const fixed = fixes.every((x) => x !== null)
            ? tokens(value)
                .map((c) => unknown.get(c) ?? c)
                .join(' ')
            : null
          ctx.report(
            'TN026',
            f.id,
            p,
            bad.length === 1
              ? `Class "${bad[0]}" produces no CSS.${didYouMean(fixes[0]!)}`
              : `Classes ${bad.map((c) => `"${c}"`).join(', ')} produce no CSS`,
            'Every class must be a Tailwind utility or a class defined in the project stylesheets. Use data-* attributes as script hooks.',
            {
              summary: fixed ? `Use "${fixed}"` : 'Fix the class name or define it in a stylesheet',
              snippet: null,
              patch: fixed ? patch(fixed) : null,
            },
          )
        }
      })
}
