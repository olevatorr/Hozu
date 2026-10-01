import { type BuildResult, buildProject, componentProject, resolveSource } from '@hozu/core/ir'
import type { RenderOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { human, relativize } from '../output.ts'
import { projectStyles } from '../styles.ts'
import { importer } from './app.ts'
import { requireComponent } from './components.ts'

export interface RenderArgs {
  variant: string[]
  props: string | undefined
  slot: string[]
}

interface Server {
  renderToString(options: { build: BuildResult; data: unknown; route: string }): Promise<{ html: string }>
}

interface Data {
  createDataRuntime(options: { build: BuildResult; resolvers: unknown }): unknown
  resolvers(project: unknown, list: () => unknown[]): unknown
}

const pairs = (list: string[], flag: string): Record<string, string> =>
  Object.fromEntries(
    list.map((item) => {
      const at = item.indexOf('=')
      if (at < 1)
        throw new HozuCliError('usage', `--${flag} takes name=value, not "${item}"`, [`--${flag} tone=ghost`])
      return [item.slice(0, at), item.slice(at + 1)]
    }),
  )

const propsOf = (text: string | undefined): Record<string, unknown> => {
  if (text === undefined) return {}
  try {
    const value = JSON.parse(text) as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {}
  throw new HozuCliError('usage', `--props takes a JSON object, not ${text}`, [`--props '{"disabled":true}'`])
}

const BODY = /<body[^>]*>([\s\S]*?)(?:<script|<\/body>)/

export async function runRender(
  loaded: Loaded,
  cwd: string,
  id: string | undefined,
  args: RenderArgs,
): Promise<RenderOutput> {
  const app = loaded.build(true)
  const entry = requireComponent(app.ir, id)
  const use = {
    variant: pairs(args.variant, 'variant'),
    props: propsOf(args.props),
    slots: pairs(args.slot, 'slot'),
  }
  const isolated = componentProject(loaded.project, entry.id, use)
  if (!isolated) throw new HozuCliError('unknown-feature', `Cannot find the declaration of ${entry.id}`, [])
  const build = buildProject(isolated, { sources: true })
  const declared = resolveSource(app.sources, entry.pointer)
  const diagnostics = relativize(
    build.diagnostics.map((d) =>
      d.location.pointer.includes('/views/HozuRender')
        ? { ...d, location: { ...d.location, source: declared } }
        : d,
    ),
    cwd,
  )
  const styles = await projectStyles(loaded.path, app)
  const owned = [
    ...new Set(entry.ir.owned.flatMap((c) => Object.keys(styles?.classes.get(c)?.properties ?? {}))),
  ].sort()
  const view = Object.values(build.ir.features).find((f) => f.views.HozuRender)!.views.HozuRender!
  const root = view.root
  const variant = 'use' in root && root.use ? root.use.variant : {}
  const ok = !diagnostics.some((d) => d.severity === 'error')
  let html = ''
  if (ok) {
    const load = importer(loaded, 'render')
    const server = await load<Server>('@hozu/runtime-server')
    const data = await load<Data>('@hozu/data')
    const runtime = data.createDataRuntime({ build, resolvers: data.resolvers(isolated, () => []) })
    const page = await server.renderToString({ build, data: runtime, route: 'render' })
    html = (BODY.exec(page.html)?.[1] ?? page.html).trim()
  }
  return {
    ok,
    component: entry.id,
    variant,
    html,
    class: /^<[a-z0-9-]+[^>]*?\sclass="([^"]*)"/.exec(html)?.[1] ?? '',
    owned,
    diagnostics,
  }
}

export function describeRender(out: RenderOutput): string {
  const variant = Object.entries(out.variant).map(([k, v]) => `${k}=${v}`)
  return [
    ...out.diagnostics.map((d) => `${human(d)}\n`),
    `${out.ok ? '✔' : '✖'} ${out.component}${variant.length ? ` ${variant.join(' ')}` : ''}`,
    ...(out.ok
      ? [out.html, `class ${out.class || '(none)'}`, `owned ${out.owned.join(' ') || '(none)'}`]
      : []),
    '',
  ].join('\n')
}
