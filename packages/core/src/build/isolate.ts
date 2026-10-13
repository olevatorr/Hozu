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
  children?: string
}

const componentsIn = (modules: readonly object[]): Record<string, object> =>
  Object.fromEntries(
    modules.flatMap((m) =>
      Object.entries(m as Record<string, unknown>).filter(
        (e): e is [string, object] => infoOf(e[1])?.kind === 'component',
      ),
    ),
  )

/** The id (`ui.Button`, `notes.Composer`) of a component declaration, by identity; null if the project has none. */
export function componentIdOf(source: unknown, decl: unknown): string | null {
  const info = infoOf(source)
  if (info?.kind !== 'project') return null
  const config = info.def as ProjectConfig
  for (const kit of config.kits ?? []) {
    const def = infoOf(kit)?.def as KitDef | undefined
    if (!def) continue
    for (const [name, c] of Object.entries(componentsIn(def.components)))
      if (c === decl) return `${def.id}.${name}`
  }
  for (const f of config.features) {
    const def = infoOf(f)?.def as FeatureConfig | undefined
    if (!def) continue
    for (const [name, c] of Object.entries(componentsIn(def.declarations)))
      if (c === decl) return `${String(def.id)}.${name}`
  }
  return null
}

function scopeOf(config: ProjectConfig, id: string) {
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
  return { own, scope, decl: scope[name] }
}

function onePage(
  config: ProjectConfig,
  own: FeatureConfig | undefined,
  scope: Record<string, object>,
  title: string,
  body: () => unknown,
): unknown {
  const view = lower.done(ui.view({ render: lower.lowered(body as () => never) }))
  const page = route({ path: '/', params: null, search: null })
  return project({
    schema: config.schema,
    routes: { render: page },
    pages: [ui.page(page, { views: [view], head: { render: () => ({ title }) } })],
    ...(config.kits ? { kits: config.kits } : {}),
    features: [
      feature({
        id: own ? String(own.id) : 'hozuRender',
        intent: { summary: title },
        declarations: [{ ...(own ? scope : {}), HozuRender: view }],
      }),
    ],
  } as never)
}

/** A one-page project whose only view is `ui.use` of the component `id`, for `hozu render`; null if no such component. */
export function componentProject(source: unknown, id: string, use: IsolatedUse): unknown {
  const info = infoOf(source)
  if (info?.kind !== 'project') return null
  const config = info.def as ProjectConfig
  const { own, scope, decl } = scopeOf(config, id)
  if (!decl) return null
  const def = infoOf(decl)!.def as ComponentDef
  const options = {
    ...(Object.keys(use.variant).length ? { variant: use.variant } : {}),
    ...(Object.keys(use.props).length ? { props: use.props } : {}),
    ...(Object.keys(use.slots).length ? { slots: use.slots } : {}),
  }
  const useOf = ui.use as (...args: unknown[]) => never
  return onePage(config, own, scope, `hozu render ${id}`, () =>
    def.children ? useOf(decl, options, use.children ? [use.children] : []) : useOf(decl, options),
  )
}

/** A one-page project whose only view is an example of the component `id`, rendered as written (`p.example`). */
export function exampleProject(source: unknown, id: string, render: () => unknown): unknown {
  const info = infoOf(source)
  if (info?.kind !== 'project') return null
  const config = info.def as ProjectConfig
  const { own, scope, decl } = scopeOf(config, id)
  if (!decl) return null
  return onePage(config, own, scope, `example of ${id}`, () => render())
}
