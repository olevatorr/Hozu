import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { buildProject } from '@tenon/core/ir'
import { createDataRuntime } from '@tenon/data'
import { compileMachine, init, transition } from '@tenon/machine'
import { validate, verify } from '@tenon/validator'

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

const machine = compileMachine(built.ir.features.cart!, built.bindings.fns)
const start = init(machine).snapshot
const add = { type: 'event', event: 'cart.AddItem', payload: { sku: 'mug', qty: 2 } } as const
const rounds = 200_000
const throughput = time(
  () => {
    let s = start
    for (let i = 0; i < rounds; i++) {
      s = transition(machine, s, add).snapshot
      s = transition(machine, s, { type: 'done', entry: s.entry, result: { items: [] } }).snapshot
    }
  },
  5,
  2,
)
record(
  'P5',
  'machine transitions per second (cart, guard + assign)',
  ((2 * rounds) / throughput) * 1000,
  '/s',
  null,
)
results.at(-1)!.ok = results.at(-1)!.value >= 1_000_000
results.at(-1)!.budget = 1_000_000
record(
  'P5',
  'contracts: verify(cart) with 11 contracts, median of 50',
  time(() => verify(built.ir, { bindings: built.bindings }), 50, 5),
  'ms',
  null,
)
const machineDist = join(root, 'packages/machine/dist')
const machineJs = readdirSync(machineDist)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(machineDist, f)))
record(
  'A6',
  '@tenon/machine dist gzip (unminified)',
  gzipSync(Buffer.concat(machineJs)).length,
  'bytes',
  null,
)

const { createResolvers } = await import(join(cartDir, 'server.ts'))
const { getProduct } = await import(join(cartDir, 'features/catalog/effects.ts'))
const data = createDataRuntime({ build: built, resolvers: createResolvers() })
const reads = 200_000
await data.query(getProduct, { sku: 'mug' })
const readSamples: number[] = []
for (let round = 0; round < 7; round++) {
  const t0 = performance.now()
  for (let i = 0; i < reads; i++) await data.query(getProduct, { sku: 'mug' })
  if (round >= 2) readSamples.push(performance.now() - t0)
}
record(
  'P6',
  'cached query reads per second (static, public)',
  (reads / median(readSamples)) * 1000,
  '/s',
  null,
)
results.at(-1)!.budget = 1_000_000
results.at(-1)!.ok = results.at(-1)!.value >= 1_000_000

record(
  'P7',
  '@tenon/runtime-client browser bundle (hydrate + machine), min+gz',
  gzipSync(readFileSync(join(root, 'packages/runtime-client/dist/browser.bundle.js'))).length,
  'bytes',
  7 * 1024,
)

const synthetic = (features: number): number[] =>
  [0, 1, 2].flatMap(() => {
    const r = spawnSync(process.execPath, [join(root, 'bench/p2.ts'), String(features)], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`bench/p2.ts ${features}: ${r.stderr}`)
    return JSON.parse(r.stdout) as number[]
  })
const sizes = [250, 500, 750, 1000]
const runs = sizes.map(synthetic)
const points = sizes.map((n, i) => [Math.log(n), Math.log(Math.min(...runs[i]!))] as const)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const mx = mean(points.map(([x]) => x))
const my = mean(points.map(([, y]) => y))
const slope =
  points.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0) /
  points.reduce((sum, [x]) => sum + (x - mx) ** 2, 0)
record(
  'P2',
  'build + validate, 1000 features × 30 states × 10 events',
  Math.exp(points.at(-1)![1]),
  'ms',
  500,
)
record('P2', 'scaling exponent, best times at 250–1000 features (1.14 ≙ 2× → 2.2×)', slope, '', 1.14)

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
    `${r.ok ? '✔' : '✖'} ${r.id}  ${r.metric.padEnd(width)}  ${String(Math.round(r.value * 1000) / 1000).padStart(12)} ${r.unit.padEnd(5)} ${r.budget === null ? '(report)' : r.unit === '/s' ? `budget ≥ ${r.budget}` : `budget ≤ ${r.budget}`}`,
  )
if (results.some((r) => !r.ok)) process.exitCode = 1
