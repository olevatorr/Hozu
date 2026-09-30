import { readdirSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const dirs = readdirSync(root).filter((d) => readdirSync(new URL(d, root)).includes('tsconfig.json'))
const dirOf = new Map(dirs.map((d) => [JSON.parse(read(`${d}/package.json`)).name as string, d]))

function sources(dir: string): string[] {
  return readdirSync(new URL(`${dir}/src/`, root), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => read(`${dir}/src/${f}`).replace(/`(?:\\.|[^`\\])*`/g, '``'))
}

describe('a clean checkout builds in one pass', () => {
  it('every workspace package imported from src is a project reference', () => {
    const missing: string[] = []
    for (const dir of dirs) {
      const refs = new Set(
        (JSON.parse(read(`${dir}/tsconfig.json`)).references ?? []).map((r: { path: string }) =>
          basename(r.path),
        ),
      )
      const imported = new Set(
        sources(dir).flatMap((s) =>
          [...s.matchAll(/^(?:import|export)\b[^'\n]*?from '((?:@hozu\/)?[a-z-]+)[/']/gm)].map((m) => m[1]!),
        ),
      )
      for (const name of imported) {
        const target = dirOf.get(name)
        if (target && target !== dir && !refs.has(target)) missing.push(`${dir} → ${target}`)
      }
    }
    expect(missing).toEqual([])
  })
})
