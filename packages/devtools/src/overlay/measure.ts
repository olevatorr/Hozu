export interface Box {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface Distance {
  axis: 'h' | 'v'
  from: number
  to: number
  at: number
}

export const sizeOf = (r: Box) => `${Math.round(r.width)} × ${Math.round(r.height)}`

/** Figma's Alt: the gaps between two separate parts, or the insets when one holds the other (ADR 0058 A3). */
export function distances(a: Box, b: Box): Distance[] {
  const lines: Distance[] = []
  const holds = (o: Box, i: Box) =>
    o.left <= i.left && o.right >= i.right && o.top <= i.top && o.bottom >= i.bottom
  const [outer, inner] = holds(b, a) ? [b, a] : holds(a, b) ? [a, b] : [null, null]
  if (outer && inner) {
    const y = inner.top + inner.height / 2
    const x = inner.left + inner.width / 2
    lines.push({ axis: 'h', from: outer.left, to: inner.left, at: y })
    lines.push({ axis: 'h', from: inner.right, to: outer.right, at: y })
    lines.push({ axis: 'v', from: outer.top, to: inner.top, at: x })
    lines.push({ axis: 'v', from: inner.bottom, to: outer.bottom, at: x })
  } else {
    const top = Math.max(a.top, b.top)
    const bottom = Math.min(a.bottom, b.bottom)
    const left = Math.max(a.left, b.left)
    const right = Math.min(a.right, b.right)
    const y = top < bottom ? (top + bottom) / 2 : a.top + a.height / 2
    const x = left < right ? (left + right) / 2 : a.left + a.width / 2
    if (b.left >= a.right) lines.push({ axis: 'h', from: a.right, to: b.left, at: y })
    else if (a.left >= b.right) lines.push({ axis: 'h', from: b.right, to: a.left, at: y })
    if (b.top >= a.bottom) lines.push({ axis: 'v', from: a.bottom, to: b.top, at: x })
    else if (a.top >= b.bottom) lines.push({ axis: 'v', from: b.bottom, to: a.top, at: x })
  }
  return lines.filter((l) => Math.round(l.to - l.from) > 0)
}
