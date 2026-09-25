import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { SchemaAdapter } from '../schema/adapter.ts'
import type { Infer, Schema } from '../schema/standard.ts'
import type { Asset } from './asset.ts'
import type { ContractDecl } from './contract.ts'
import type { MutationDecl, QueryDecl } from './effects.ts'
import type { EventDecl } from './event.ts'
import type { FnDecl } from './fn.ts'
import type { MachineDecl } from './machine.ts'
import type { PageDecl } from './page.ts'
import type { RouteDecl } from './route.ts'
import type { TagDecl } from './tag.ts'
import type { ViewDecl } from './ui.ts'
import type { WidgetDecl } from './widget.ts'

export interface FeatureConfig {
  id: string
  intent: { summary: string; invariants: string[] }
  styles: URL[]
  imports: FeatureDecl[]
  tags: Record<string, TagDecl<any>>
  events: Record<string, EventDecl<any>>
  queries: Record<string, QueryDecl>
  mutations: Record<string, MutationDecl>
  fns: Record<string, FnDecl>
  machine: MachineDecl | null
  views: Record<string, ViewDecl>
  widgets: Record<string, WidgetDecl>
  contracts: Record<string, ContractDecl>
  exports: {
    events: EventDecl<any>[]
    queries: QueryDecl[]
    mutations: MutationDecl[]
    tags: TagDecl<any>[]
    fns: FnDecl[]
    views: ViewDecl[]
  }
}

export interface FeatureDecl extends Decl<'feature'> {
  readonly id: string
}

export const feature = (config: FeatureConfig): FeatureDecl =>
  brand({ id: config.id }, 'feature', { ...config })

export interface ProjectConfig {
  schema: SchemaAdapter
  session: Schema | null
  routes: Record<string, RouteDecl>
  site: { url: string; name: string; lang: string; icon: Asset | null; themeColor: string | null } | null
  styles: URL | null
  notFound: RouteDecl | null
  error: RouteDecl | null
  pages: PageDecl[]
  features: FeatureDecl[]
}

export interface ProjectDecl<Session = unknown> extends Decl<'project'>, Typed<{ session: Session }> {}

export const project = <S extends Schema | null>(
  config: Omit<ProjectConfig, 'session'> & { session: S },
): ProjectDecl<S extends Schema ? Infer<S> : null> => brand({}, 'project', { ...config })
