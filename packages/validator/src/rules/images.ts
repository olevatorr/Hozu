import { at, resolveAt } from '@tenon/core/ir'
import type { Ctx } from '../context.ts'
import { walkView } from '../walk.ts'

export function imageDimensions(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'el' || node.tag !== 'img') return
        if (node.attrs.width && node.attrs.height) return
        const src = node.attrs.src
        const known =
          src && 'literal' in src && typeof src.literal === 'string' ? ctx.assets[src.literal] : null
        const size = known?.width && known.height ? { width: known.width, height: known.height } : null
        ctx.report(
          'TN028',
          f.id,
          at(pointer, 'attrs'),
          '<img> without width and height',
          'Without intrinsic dimensions the browser cannot reserve space, so the layout shifts when the image loads (CLS).',
          {
            summary: size
              ? `Add width ${size.width} and height ${size.height}`
              : 'Add width and height attributes',
            snippet: size ? null : 'ui.img({ src, alt, width: 1200, height: 630 })',
            patch: size
              ? (['width', 'height'] as const)
                  .filter((k) => !node.attrs[k])
                  .map((k) => ({
                    op: 'add' as const,
                    path: resolveAt(at(pointer, 'attrs', k)),
                    value: { literal: size[k] },
                  }))
              : null,
          },
        )
      })
}
