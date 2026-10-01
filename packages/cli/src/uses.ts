import { relative } from 'node:path'
import { type ProjectIR, resolveSource, type SourceIndex, type ViewNode } from '@hozu/core/ir'
import type { CheckOverrides, ComponentUseSite } from './contract.ts'

export function componentUses(
  ir: ProjectIR,
  sources: SourceIndex,
  cwd: string,
): [component: string, site: ComponentUseSite][] {
  const out: [string, ComponentUseSite][] = []
  const walk = (feature: string, n: ViewNode, p: string) => {
    switch (n.kind) {
      case 'el':
      case 'component':
        if (n.use) {
          const loc = resolveSource(sources, p)
          out.push([
            n.use.component,
            {
              feature,
              node: n.id,
              at: loc ? `${relative(cwd, loc.file)}:${loc.line}` : null,
              variant: n.use.variant,
              added: n.use.added,
              overrides: n.use.overrides,
            },
          ])
        }
        n.children.forEach((c, i) => walk(feature, c, `${p}/children/${i}`))
        return
      case 'when':
        n.children.forEach((c, i) => walk(feature, c, `${p}/children/${i}`))
        return
      case 'if':
        n.ifTrue.forEach((c, i) => walk(feature, c, `${p}/ifTrue/${i}`))
        n.ifFalse.forEach((c, i) => walk(feature, c, `${p}/ifFalse/${i}`))
        return
      case 'each':
        walk(feature, n.item, `${p}/item`)
        return
      case 'query':
        walk(feature, n.ready, `${p}/ready`)
        if (n.pending) walk(feature, n.pending, `${p}/pending`)
        for (const [name, c] of Object.entries(n.failed)) walk(feature, c, `${p}/failed/${name}`)
        return
      default:
        return
    }
  }
  for (const f of Object.values(ir.features))
    for (const [vid, v] of Object.entries(f.views)) walk(f.id, v.root, `/features/${f.id}/views/${vid}/root`)
  return out
}

export function overridesOf(uses: [string, ComponentUseSite][]): CheckOverrides[] {
  const by = new Map<string, ComponentUseSite[]>()
  for (const [component, site] of uses)
    if (site.overrides.length) by.set(component, [...(by.get(component) ?? []), site])
  return [...by]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([component, sites]) => ({
      component,
      overrides: sites.reduce((n, s) => n + s.overrides.length, 0),
      uses: sites,
    }))
}

export function describeOverrides(o: CheckOverrides): string {
  const places = new Map<string, number>()
  for (const u of o.uses) places.set(u.feature, (places.get(u.feature) ?? 0) + u.overrides.length)
  const listed = [...places].map(([f, n]) => (n > 1 ? `${f} ×${n}` : f))
  const shown = listed.slice(0, 3).join(', ') + (listed.length > 3 ? `, +${listed.length - 3} more` : '')
  return `${o.component}: ${o.overrides} override${o.overrides === 1 ? '' : 's'} — ${shown}`
}
