import { at, resolveAt } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { walkView } from '../walk.ts'

const fixed = (value: string | undefined) =>
  value !== undefined && value !== 'auto' && !value.includes('content') && !value.endsWith('%')

function reservedByClasses(ctx: Ctx, cls: string | null): boolean {
  if (!ctx.classes || !cls) return false
  const set: Record<string, string> = {}
  for (const c of cls.split(/\s+/)) {
    const style = ctx.classes.get(c)
    if (style && style.variant === '') Object.assign(set, style.properties)
  }
  const width = fixed(set.width)
  const fluid = width || set.width === '100%'
  const height = fixed(set.height)
  return (width && height) || (fixed(set['aspect-ratio']) && (fluid || height))
}

export function imageDimensions(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'el' || node.tag !== 'img') return
        if (node.attrs.width && node.attrs.height) return
        if (reservedByClasses(ctx, node.class)) return
        const src = node.attrs.src
        const known =
          src && 'literal' in src && typeof src.literal === 'string' ? ctx.assets[src.literal] : null
        const size = known?.width && known.height ? { width: known.width, height: known.height } : null
        ctx.report(
          'HZ028',
          f.id,
          at(pointer, 'attrs'),
          '<img> without width and height',
          'Without intrinsic dimensions the browser cannot reserve space, so the layout shifts when the image loads (CLS).',
          {
            summary: size
              ? `Add width ${size.width} and height ${size.height}`
              : 'Add width and height attributes (the design ratio with object-cover when the size varies), or classes that fix both (size-16, aspect-video w-full)',
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
