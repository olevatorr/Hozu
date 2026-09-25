import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProject } from '@tenon/core/ir'
import { validate } from '@tenon/validator'
import { syntheticProject } from './synthetic.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const cartDir = join(root, 'examples/cart')

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

function samples(run: () => void, repeat: number, warmup: number): number[] {
  for (let i = 0; i < warmup; i++) run()
  const out: number[] = []
  for (let i = 0; i < repeat; i++) {
    const start = performance.now()
    run()
    out.push(performance.now() - start)
  }
  return out
}

const time = (run: () => void, repeat: number, warmup = Math.min(repeat, 20)) =>
  median(samples(run, repeat, warmup))

const results: {
  id: string
  metric: string
  value: number
  unit: string
  budget: number | null
  ok: boolean
}[] = []
const record = (id: string, metric: string, value: number, unit: string, budget: number | null) =>
  results.push({
    id,
    metric,
    value: Math.round(value * 1000) / 1000,
    unit,
    budget,
    ok: budget === null || value <= budget,
  })

const cart = (await import(join(cartDir, 'tenon.config.ts'))).default
const built = buildProject(cart)
record(
  'P1',
  'validate(cart) warm, median of 500',
  time(() => validate(built.ir, { sources: built.sources }), 500),
  'ms',
  2,
)

const synthetic = (features: number) => {
  const project = syntheticProject(features)
  return samples(
    () => {
      const r = buildProject(project, { sources: false })
      if (r.diagnostics.length) throw new Error(`synthetic build: ${r.diagnostics[0]!.message}`)
      const d = validate(r.ir)
      if (d.length) throw new Error(`synthetic validate: ${d[0]!.code} ${d[0]!.message}`)
    },
    7,
    2,
  )
}
const half = synthetic(500)
const full = synthetic(1000)
record('P2', 'build + validate, 1000 features × 30 states × 10 events', median(full), 'ms', 500)
record('P2', 'scaling 1000 / 500 features (best of 7)', Math.min(...full) / Math.min(...half), '×', 2.2)

const bin = join(root, 'packages/cli/bin/tenon.js')
const cold: number[] = []
for (let i = 0; i < 10; i++) {
  const start = performance.now()
  const r = spawnSync(process.execPath, [bin, 'validate', '--json'], { cwd: cartDir, encoding: 'utf8' })
  cold.push(performance.now() - start)
  if (r.status !== 0) throw new Error(`tenon validate failed: ${r.stdout}${r.stderr}`)
}
record('P3', 'tenon validate --json cold start, median of 10', median(cold), 'ms', 300)

const tsc = join(root, 'node_modules/.bin/tsc')
const diag = execFileSync(tsc, ['-p', join(cartDir, 'tsconfig.json'), '--extendedDiagnostics'], {
  encoding: 'utf8',
})
record(
  'A4',
  'type instantiations for examples/cart',
  Number(/Instantiations:\s+(\d+)/.exec(diag)?.[1] ?? Number.NaN),
  '',
  50_000,
)

const bytes = (dir: string): number =>
  readdirSync(dir).reduce((sum, name) => {
    if (name === 'node_modules') return sum
    const p = join(dir, name)
    return sum + (statSync(p).isDirectory() ? bytes(p) : name.endsWith('.ts') ? readFileSync(p).length : 0)
  }, 0)
record('A6', 'examples/cart source size', bytes(cartDir), 'bytes', null)

const width = Math.max(...results.map((r) => r.metric.length))
for (const r of results)
  console.log(
    `${r.ok ? '✔' : '✖'} ${r.id}  ${r.metric.padEnd(width)}  ${String(r.value).padStart(10)} ${r.unit.padEnd(5)} ${r.budget === null ? '(report)' : `budget ≤ ${r.budget}`}`,
  )
if (results.some((r) => !r.ok)) process.exitCode = 1
