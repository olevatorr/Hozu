import type { JsonSchema } from '../ir/types.ts'
import { brand, type Decl } from '../model/decl.ts'
import type { StandardSchemaV1 } from './standard.ts'

export interface SchemaAdapterDef {
  vendor: string
  toJsonSchema: (schema: StandardSchemaV1) => JsonSchema
}

export interface SchemaAdapter extends Decl<'adapter'> {
  readonly vendor: string
}

export const defineSchemaAdapter = (def: SchemaAdapterDef): SchemaAdapter =>
  brand({ vendor: def.vendor }, 'adapter', def)
