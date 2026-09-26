import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createGenerator } from 'ts-json-schema-generator'

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

export const targets = [
  {
    source: 'packages/core/src/ir/types.ts',
    type: 'ProjectIR',
    out: 'packages/core/schema/project-ir.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'ValidateOutput',
    out: 'packages/cli/schema/validate.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'InspectOutput',
    out: 'packages/cli/schema/inspect.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'GraphOutput',
    out: 'packages/cli/schema/graph.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'ExplainOutput',
    out: 'packages/cli/schema/explain.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'ImpactOutput',
    out: 'packages/cli/schema/impact.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'PlanOutput',
    out: 'packages/cli/schema/plan.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'BuildOutput',
    out: 'packages/cli/schema/build.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'SkillOutput',
    out: 'packages/cli/schema/skill.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'CheckOutput',
    out: 'packages/cli/schema/check.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'RequestOutput',
    out: 'packages/cli/schema/request.schema.json',
  },
  {
    source: 'packages/cli/src/contract.ts',
    type: 'AddOutput',
    out: 'packages/cli/schema/add.schema.json',
  },
]

export function generate(target: (typeof targets)[number]): string {
  const schema = createGenerator({
    path: root(target.source),
    tsconfig: root('tsconfig.base.json'),
    type: target.type,
    expose: 'export',
    topRef: true,
    additionalProperties: false,
    skipTypeCheck: true,
  }).createSchema(target.type)
  return `${JSON.stringify(schema, null, 2)}\n`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const target of targets) writeFileSync(root(target.out), generate(target))
}
