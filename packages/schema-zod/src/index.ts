import { defineSchemaAdapter, type SchemaAdapter } from '@tenon/core'
import type { JsonSchema } from '@tenon/core/ir'
import { toJSONSchema, type ZodType } from 'zod'

export const zodAdapter: SchemaAdapter = defineSchemaAdapter({
  vendor: 'zod',
  toJsonSchema: (schema) => {
    const { $schema: _, ...json } = toJSONSchema(schema as unknown as ZodType, { io: 'output' }) as JsonSchema
    return json
  },
})
