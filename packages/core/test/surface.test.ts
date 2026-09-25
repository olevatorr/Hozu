import { readFileSync } from 'node:fs'
import * as core from '@tenon/core'
import { buildProject } from '@tenon/core/ir'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import cartProject from '../../../examples/cart/tenon.config.ts'
import { generate, targets } from '../../../scripts/gen-schemas.ts'

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8')

describe('A3 public surface', () => {
  it('exports at most 15 values, no aliases', () => {
    const names = Object.keys(core).sort()
    expect(names).toMatchInlineSnapshot(`
      [
        "contract",
        "defineSchemaAdapter",
        "event",
        "feature",
        "fn",
        "invoke",
        "machine",
        "mutation",
        "on",
        "op",
        "project",
        "query",
        "route",
        "tag",
        "ui",
      ]
    `)
    expect(names.length).toBeLessThanOrEqual(15)
    expect(new Set(Object.values(core)).size).toBe(names.length)
  })
})

describe('IR JSON Schema', () => {
  it('is up to date with the TypeScript types', () => {
    for (const target of targets) expect(generate(target), target.out).toBe(read(target.out))
  }, 60_000)

  it('accepts the cart IR', () => {
    const ajv = new Ajv({ allErrors: true, strict: false })
    const valid = ajv.validate(
      JSON.parse(read('packages/core/schema/project-ir.schema.json')),
      buildProject(cartProject).ir,
    )
    expect(ajv.errors ?? []).toEqual([])
    expect(valid).toBe(true)
  })
})

describe('P4 dependencies', () => {
  it.each(['core', 'machine', 'data', 'compiler', 'runtime-client', 'validator', 'cli', 'dev'])(
    '@tenon/%s has no third-party runtime dependencies',
    (pkg) => {
      const manifest = JSON.parse(read(`packages/${pkg}/package.json`))
      const deps = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })
      expect(deps.filter((d) => !d.startsWith('@tenon/'))).toEqual([])
    },
  )
})
