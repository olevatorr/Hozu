import { brand, type Decl, type Typed } from '../model/decl.ts'
import type { SchemaAdapter } from '../schema/adapter.ts'
import type { Infer, Schema } from '../schema/standard.ts'
import type { ContractDecl } from './contract.ts'
import type { MutationDecl, QueryDecl } from './effects.ts'
import type { EventDecl } from './event.ts'
import type { FnDecl } from './fn.ts'
import type { MachineDecl } from './machine.ts'
import type { RouteDecl } from './route.ts'
import type { TagDecl } from './tag.ts'
import type { ViewDecl } from './ui.ts'

export interface FeatureConfig {
  id: string
  intent: { summary: string; invariants: string[] }
  imports: FeatureDecl[]
  tags: Record<string, TagDecl<any>>
  events: Record<string, EventDecl<any>>
  queries: Record<string, QueryDecl>
  mutations: Record<string, MutationDecl>
  fns: Record<string, FnDecl>
  machine: MachineDecl | null
  views: Record<string, ViewDecl>
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
  features: FeatureDecl[]
}

export interface ProjectDecl<Session = unknown> extends Decl<'project'>, Typed<{ session: Session }> {}

export const project = <S extends Schema | null>(
  config: Omit<ProjectConfig, 'session'> & { session: S },
): ProjectDecl<S extends Schema ? Infer<S> : null> => brand({}, 'project', { ...config })
