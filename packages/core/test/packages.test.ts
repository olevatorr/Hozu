import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const manifests = readdirSync(root)
  .map((dir) => JSON.parse(readFileSync(`${root}${dir}/package.json`, 'utf8')))
  .filter((m) => !m.private)

describe('published package metadata', () => {
  it('every published package names its license, repository and funding (ADR 0057 A5)', () => {
    expect(manifests.length).toBe(21)
    for (const m of manifests)
      expect([m.name, m.license, m.repository?.directory?.startsWith('packages/'), m.funding]).toEqual([
        m.name,
        'MIT',
        true,
        'https://ko-fi.com/hozu',
      ])
  })
})
