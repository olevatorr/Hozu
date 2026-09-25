import { brand, type Decl } from '../model/decl.ts'
import type { SchemaAdapter } from '../schema/adapter.ts'
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
  routes: Record<string, RouteDecl>
  features: FeatureDecl[]
}

export interface ProjectDecl extends Decl<'project'> {}

export const project = (config: ProjectConfig): ProjectDecl => brand({}, 'project', { ...config })
