import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One example's browse script (ADR 0072 D2): the steps a person takes, run with JavaScript on. */
export interface Script {
  path: string
  steps: string[]
}

export interface Smoothness {
  flashes: number
  shift: number
  runs: number
  problems: string[]
}

const root = fileURLToPath(new URL('../', import.meta.url))
const cli = join(root, 'packages/cli/bin/hozu.js')

export function smoothness(only: string[] = []): Smoothness {
  const out: Smoothness = { flashes: 0, shift: 0, runs: 0, problems: [] }
  for (const name of readdirSync(join(root, 'examples')).sort()) {
    const dir = join(root, 'examples', name)
    const file = join(dir, 'browse.json')
    if (!existsSync(file) || (only.length && !only.includes(name))) continue
    for (const script of JSON.parse(readFileSync(file, 'utf8')) as Script[]) {
      out.runs++
      const args = [cli, 'browse', script.path, '--json', ...script.steps.flatMap((s) => ['--do', s])]
      const run = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 120_000 })
      const at = `${name} ${script.path}`
      let result: {
        errors: { text: string }[]
        steps: {
          step: string
          ok: boolean
          note: string | null
          modes: { flashes?: { count: number; elements: string[] }; shift?: number }[]
        }[]
      }
      try {
        result = JSON.parse(run.stdout)
      } catch {
        out.problems.push(`${at}: ${(run.stderr || run.stdout).slice(-500)}`)
        continue
      }
      for (const e of result.errors) out.problems.push(`${at}: ${e.text}`)
      for (const s of result.steps) {
        if (!s.ok) out.problems.push(`${at}: ${s.step}: ${s.note}`)
        for (const m of s.modes ?? []) {
          if (m.flashes) {
            out.flashes += m.flashes.count
            out.problems.push(`${at}: ${s.step}: flash ${m.flashes.elements.join('; ')}`)
          }
          if (m.shift) {
            out.shift = Math.max(out.shift, m.shift)
            if (m.shift >= 0.01) out.problems.push(`${at}: ${s.step}: layout shift ${m.shift}`)
          }
        }
      }
    }
  }
  return out
}

if (import.meta.main) {
  const r = smoothness(process.argv.slice(2))
  console.log(JSON.stringify(r, null, 2))
  if (r.problems.length) process.exitCode = 1
}
