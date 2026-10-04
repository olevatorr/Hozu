import type { ComponentDecl, ComponentTypes } from './builders/component.ts'
import type { QueryDecl } from './builders/effects.ts'
import type { RouteDecl } from './builders/route.ts'
import type { SourceLoc } from './ir/diagnostic.ts'
import { captureSource } from './source/capture.ts'

export interface ComponentPreviewUse<T extends ComponentTypes> {
  variant?: T['variant']
  props?: T['props']
  slots?: { [K in T['slots']]?: string }
  children?: string
}

export interface ComponentPreview {
  kind: 'component'
  component: ComponentDecl
  name: string
  use: { variant?: object; props?: object; slots?: Record<string, string>; children?: string }
  at: SourceLoc | null
}

export interface PreviewData {
  kind: 'data' | 'fail'
  query: QueryDecl
  output?: unknown
  error?: string
  data?: unknown
  at: SourceLoc | null
}

export interface PagePreview {
  kind: 'page'
  route: RouteDecl
  name: string
  data: PreviewData[]
  at: SourceLoc | null
}

export type Preview = ComponentPreview | PagePreview

export interface PreviewSet {
  readonly hozuPreviews: true
  readonly list: Preview[]
}

type ErrorsOf<Q> = Q extends QueryDecl<any, any, infer E> ? keyof E & string : never

const builders = {
  /** A named state of a component, shown in DevTools Assets: `p.component(ui.Button, 'Long label', { children: '…' })`. */
  component: <T extends ComponentTypes>(
    component: ComponentDecl<T>,
    name: string,
    use: ComponentPreviewUse<T> = {},
  ): ComponentPreview => ({
    kind: 'component',
    component,
    name,
    use: use as ComponentPreview['use'],
    at: captureSource(),
  }),
  /** A named screen of a page whose queries answer with the data given, under `hozu dev` only. */
  page: (route: RouteDecl, name: string, data: PreviewData[]): PagePreview => ({
    kind: 'page',
    route,
    name,
    data,
    at: captureSource(),
  }),
  /** The value a query answers with in a page preview; checked against its output schema (HZ092). */
  data: <O>(query: QueryDecl<any, O, any>, output: O): PreviewData => ({
    kind: 'data',
    query,
    output,
    at: captureSource(),
  }),
  /** A declared error (or `Unexpected`) a query answers with in a page preview. */
  fail: <Q extends QueryDecl<any, any, any>>(
    query: Q,
    error: ErrorsOf<Q> | 'Unexpected',
    data?: unknown,
  ): PreviewData => ({
    kind: 'fail',
    query,
    error,
    data: data ?? {},
    at: captureSource(),
  }),
}

export type PreviewBuilders = typeof builders

/**
 * Screens for people, not for the app (ADR 0058 H): named in `project({ previews })`, loaded only by `hozu dev`,
 * `hozu check` and `hozu render`, never by a production server or `hozu build`.
 */
export const previews = (make: (p: PreviewBuilders) => Preview[]): PreviewSet =>
  Object.freeze({ hozuPreviews: true as const, list: make(builders) })

export const isPreviewSet = (value: unknown): value is PreviewSet =>
  !!value && typeof value === 'object' && (value as PreviewSet).hozuPreviews === true
