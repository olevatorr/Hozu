import type { ImageVariant, ViewNode } from '@tenon/core/ir'

export type Variants = Record<string, ImageVariant[]>

const memo = new WeakMap<Variants, WeakMap<ViewNode, ViewNode>>()

export function responsive(n: ViewNode, variants: Variants): ViewNode {
  let seen = memo.get(variants)
  if (!seen) {
    seen = new WeakMap()
    memo.set(variants, seen)
  }
  let hit = seen.get(n)
  if (!hit) {
    hit = transform(n, variants)
    seen.set(n, hit)
  }
  return hit
}

function transform(n: ViewNode, variants: Variants): ViewNode {
  const list = (xs: ViewNode[]) => xs.map((x) => responsive(x, variants))
  switch (n.kind) {
    case 'el': {
      const src = n.attrs.src
      const set =
        n.tag === 'img' && src && 'literal' in src && typeof src.literal === 'string'
          ? variants[src.literal]
          : null
      if (!set?.length || n.attrs.srcset) return { ...n, children: list(n.children) }
      const width = n.attrs.width
      const w = width && 'literal' in width && typeof width.literal === 'number' ? width.literal : null
      return {
        ...n,
        attrs: {
          ...n.attrs,
          srcset: { literal: set.map((v) => `${v.href} ${v.width}w`).join(', ') },
          ...(n.attrs.sizes ? {} : { sizes: { literal: w ? `(max-width: ${w}px) 100vw, ${w}px` : '100vw' } }),
        },
      }
    }
    case 'widget':
    case 'when':
      return { ...n, children: list(n.children) }
    case 'if':
      return { ...n, ifTrue: list(n.ifTrue), ifFalse: list(n.ifFalse) }
    case 'each':
      return { ...n, item: responsive(n.item, variants) }
    case 'query':
      return {
        ...n,
        ready: responsive(n.ready, variants),
        pending: n.pending ? responsive(n.pending, variants) : null,
        failed: Object.fromEntries(Object.entries(n.failed).map(([k, x]) => [k, responsive(x, variants)])),
      }
    default:
      return n
  }
}
