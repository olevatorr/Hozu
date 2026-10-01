import type { ComponentDef, KitDef } from '../builders/component.ts'
import { type FeatureConfig, feature, type ProjectConfig, project } from '../builders/feature.ts'
import { route } from '../builders/route.ts'
import { ui } from '../builders/ui.ts'
import { lower } from '../lower.ts'
import { infoOf } from '../model/decl.ts'

export interface IsolatedUse {
  variant: Record<string, string>
  props: Record<string, unknown>
  slots: Record<string, string>
}

const componentsIn = (modules: readonly object[]): Record<string, object> =>
  Object.fromEntries(
    modules.flatMap((m) =>
      Object.entries(m as Record<string, unknown>).filter(
        (e): e is [string, object] => infoOf(e[1])?.kind === 'component',
      ),
    ),
  )

/** A one-page project whose only view is `ui.use` of the component `id`, for `hozu render`; null if no such component. */
export function componentProject(source: unknown, id: string, use: IsolatedUse): unknown {
  const info = infoOf(source)
  if (info?.kind !== 'project') return null
  const config = info.def as ProjectConfig
  const [owner, name = ''] = id.split('.')
  const kit = (config.kits ?? []).find((k) => (infoOf(k)?.def as KitDef | undefined)?.id === owner)
  const own = config.features
    .map((f) => infoOf(f)?.def as FeatureConfig | undefined)
    .find((f) => f !== undefined && String(f.id) === owner)
  const scope = kit
    ? componentsIn((infoOf(kit)!.def as KitDef).components)
    : own
      ? componentsIn(own.declarations)
      : {}
  const decl = scope[name]
  if (!decl) return null
  const def = infoOf(decl)!.def as ComponentDef
  const options = {
    ...(Object.keys(use.variant).length ? { variant: use.variant } : {}),
    ...(Object.keys(use.props).length ? { props: use.props } : {}),
    ...(Object.keys(use.slots).length ? { slots: use.slots } : {}),
  }
  const useOf = ui.use as (...args: unknown[]) => never
  const render = lower.lowered(() => (def.children ? useOf(decl, options, []) : useOf(decl, options)))
  const view = lower.done(ui.view({ render }))
  const page = route({ path: '/', params: null, search: null })
  return project({
    schema: config.schema,
    routes: { render: page },
    pages: [ui.page(page, { views: [view], head: { render: () => ({ title: id }) } })],
    ...(config.kits ? { kits: config.kits } : {}),
    features: [
      feature({
        id: own ? String(own.id) : 'hozuRender',
        intent: { summary: `hozu render ${id}` },
        declarations: [{ ...(own ? scope : {}), HozuRender: view }],
      }),
    ],
  } as never)
}
