import type { BuildResult, FeatureIR, Json, ValueExpr, ViewNode } from '@hozu/core/ir'
import { equal, getIn, pathOf } from '@hozu/machine'
import { attrText, classText, styleText, text } from '@hozu/runtime-client'
import { escapeHtml } from './escape.ts'
import { generateRender } from './generate.ts'
import { responsive, type Variants } from './images.ts'

export interface Scope {
  feature: FeatureIR
  context: Json
  state: string | null
  bindings: Json[]
  params: Json
  search: Json
  routes: Record<string, string>
  url: string
  locale: string
  alternate: Record<string, string>
  env: Json
}

export interface RenderRuntime {
  island(id: string, scope: Scope, scoped: Json[]): string
  embed(view: string): { scope: Scope } | null
  component(ref: string): void
}

export type Fns = Record<string, (x: Json) => Json>
export type RenderFn = (scope: Scope, runtime: RenderRuntime, fns: Fns) => string
export type RenderTable = Record<string, RenderFn>
export type RenderModule = { default: (helpers: Helpers) => RenderTable }

type Shape = true | [string, Shape][]

const project = (value: Json, shape: Shape): Json => {
  if (shape === true || typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const out: { [k: string]: Json } = {}
  for (const [k, s] of shape) if (k in value) out[k] = project(value[k]!, s)
  return out
}

const attr = (name: string, x: Json) => {
  const s = attrText(name, x)
  return s === null ? '' : s === '' ? ` ${name}` : ` ${name}="${escapeHtml(s)}"`
}

const classAttr = (c: string) => (c ? ` class="${escapeHtml(c)}"` : '')
const styleAttr = (s: string) => (s ? ` style="${escapeHtml(s)}"` : '')

type Styled = Pick<Extract<ViewNode, { kind: 'el' }>, 'class' | 'toggle' | 'vars'>

export function classAndStyle(n: Styled, value: (v: ValueExpr) => Json): string {
  const active: string[] = []
  for (const c in n.toggle) if (value(n.toggle[c]!) === true) active.push(c)
  return (
    classAttr(classText(n.class, active)) +
    styleAttr(styleText(Object.entries(n.vars).map(([k, v]) => [k, value(v)])))
  )
}

export const helpers = {
  escapeHtml,
  text,
  attr,
  classText,
  styleText,
  classAttr,
  styleAttr,
  getIn,
  equal,
  pathOf,
  num: (x: Json) => (typeof x === 'number' || typeof x === 'string' ? x : Number.NaN),
  call: (fns: Fns, name: string, arg: Json) => {
    const impl = fns[name]
    if (!impl) throw new Error(`No implementation bound for fn ${name}`)
    return impl(arg)
  },
  project,
}

export type Helpers = typeof helpers

export const instantiate = (module: RenderModule): RenderTable => module.default(helpers)

export class RenderModuleError extends Error {
  override name = 'RenderModuleError'
}

export async function loadRender(source: string): Promise<RenderTable> {
  let module: RenderModule
  try {
    module = (await import(
      /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`
    )) as RenderModule
  } catch (cause) {
    throw new RenderModuleError(
      'This runtime cannot load generated render code. Run `hozu build` and pass the generated module: ' +
        "createHandler({ render: await import('./dist/server/render.js') }).",
      { cause },
    )
  }
  return instantiate(module)
}

const loaded = new WeakMap<BuildResult, Map<Variants | null, Promise<RenderTable>>>()
const loadedDev = new WeakMap<BuildResult, Map<Variants | null, Promise<RenderTable>>>()

export function renderTableFor(
  build: BuildResult,
  images: Variants | null,
  dev = false,
): Promise<RenderTable> {
  const cache = dev ? loadedDev : loaded
  let byImages = cache.get(build)
  if (!byImages) {
    byImages = new Map()
    cache.set(build, byImages)
  }
  let table = byImages.get(images)
  if (!table) {
    table = loadRender(generateRender(build, images, dev))
    byImages.set(images, table)
  }
  return table
}

const nodeMaps = new WeakMap<BuildResult, Map<Variants | null, Map<string, ViewNode>>>()

export function nodesById(build: BuildResult, images: Variants | null): Map<string, ViewNode> {
  let byImages = nodeMaps.get(build)
  if (!byImages) {
    byImages = new Map()
    nodeMaps.set(build, byImages)
  }
  let map = byImages.get(images)
  if (!map) {
    const out = new Map<string, ViewNode>()
    const walk = (n: ViewNode) => {
      out.set(n.id, n)
      switch (n.kind) {
        case 'el':
        case 'when':
        case 'component':
          n.children.forEach(walk)
          return
        case 'if':
          n.ifTrue.forEach(walk)
          n.ifFalse.forEach(walk)
          return
        case 'each':
          walk(n.item)
          return
        case 'query':
          walk(n.ready)
          if (n.pending) walk(n.pending)
          for (const k in n.failed) walk(n.failed[k]!)
          return
        default:
          return
      }
    }
    for (const f of Object.values(build.ir.features))
      for (const v of Object.values(f.views)) walk(images ? responsive(v.root, images) : v.root)
    map = out
    byImages.set(images, map)
  }
  return map
}
