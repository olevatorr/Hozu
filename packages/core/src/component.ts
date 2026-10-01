/// <reference lib="dom" />
import type { ComponentDecl } from './builders/component.ts'

type Client<C> = C extends ComponentDecl<infer T> ? T['client'] : never

export interface ComponentContext<P, E> {
  el: HTMLElement
  props: P
  emit<K extends keyof E & string>(event: K, detail: E[K]): void
  signal: AbortSignal
}

export interface ComponentInstance<P> {
  update?(props: P): void
  destroy?(): void
}

export type ComponentSetup<P = any, E = any> = (
  context: ComponentContext<P, E>,
) => ComponentInstance<P> | undefined

export const implement = <C extends ComponentDecl>(
  setup: ComponentSetup<Client<C>['props'], Client<C>['emits']>,
): ComponentSetup<Client<C>['props'], Client<C>['emits']> => setup
