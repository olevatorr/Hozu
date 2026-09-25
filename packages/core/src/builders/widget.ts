import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { Infer, Schema } from '../schema/standard.ts'
import type { HtmlTag } from './ui.ts'

export type WidgetLoad = 'eager' | 'visible' | 'idle'

export interface WidgetDef {
  tag: string
  props: Schema
  events: Record<string, Schema>
  client: URL
  load: WidgetLoad
  wraps: boolean
}

export interface WidgetDecl<P = any, E = any> extends Decl<'widget'>, Typed<{ props: P; events: E }> {}

export function widget<P extends Schema, E extends Record<string, Schema>>(config: {
  tag: HtmlTag
  props: P
  events: E
  client: URL
  load: WidgetLoad
  wraps: boolean
}): WidgetDecl<Infer<P>, { [K in keyof E]: Infer<E[K]> }> {
  return brand({}, 'widget', { ...config } satisfies WidgetDef) as never
}
