import { defineSchemaAdapter, type SchemaAdapter } from '@tenonkit/core'
import type { JsonSchema } from '@tenonkit/core/ir'
import { toJSONSchema, type ZodType } from 'zod'

export const zodAdapter: SchemaAdapter = defineSchemaAdapter({
  vendor: 'zod',
  toJsonSchema: (schema) => {
    const { $schema: _, ...json } = toJSONSchema(schema as unknown as ZodType, { io: 'output' }) as JsonSchema
    return json
  },
})
