/// <reference lib="dom" />
import type { WidgetDecl } from './builders/widget.ts'

type Phantom<W> = W extends WidgetDecl<infer P, infer E> ? { props: P; events: E } : never

export interface WidgetContext<P, E> {
  el: HTMLElement
  props: P
  emit<K extends keyof E & string>(event: K, detail: E[K]): void
  signal: AbortSignal
}

export interface WidgetInstance<P> {
  update?(props: P): void
  destroy?(): void
}

export type WidgetSetup<P = any, E = any> = (context: WidgetContext<P, E>) => WidgetInstance<P> | undefined

export const implement = <W extends WidgetDecl>(
  setup: WidgetSetup<Phantom<W>['props'], Phantom<W>['events']>,
): WidgetSetup<Phantom<W>['props'], Phantom<W>['events']> => setup
