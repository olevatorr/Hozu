import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime } from '@hozu/data'
import { compileMachine, init, transition } from '@hozu/machine'
import { appOptionsOf, generateRender } from '@hozu/runtime-server'
import { validate, verify } from '@hozu/validator'

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

const cart = (await import(join(cartDir, 'hozu.config.ts'))).default
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
record('A6', '@hozu/machine dist gzip (unminified)', gzipSync(Buffer.concat(machineJs)).length, 'bytes', null)

record(
  'P10',
  'render code generation for examples/cart, median of 20',
  time(() => generateRender(built), 20, 3),
  'ms',
  null,
)
record('A6', 'generated render code for examples/cart', generateRender(built).length, 'bytes', null)

const { default: cartApp } = await import(join(cartDir, 'app.ts'))
const { getProduct } = await import(join(cartDir, 'features/catalog/effects.ts'))
const data = createDataRuntime({ build: built, resolvers: appOptionsOf(cartApp)!.resolvers })
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

const clientSeen = new Set<string>()
function clientBytes(file: string): number {
  if (clientSeen.has(file)) return 0
  clientSeen.add(file)
  const code = readFileSync(join(root, 'packages/runtime-client/dist/browser', file), 'utf8')
  const deps = [...code.matchAll(/from"\.\/(chunk-[A-Z0-9]+\.js)"/g)].map((m) => m[1]!)
  return gzipSync(code).length + deps.reduce((sum, d) => sum + clientBytes(d), 0)
}

function initialClientBytes(): number {
  return clientBytes('client.js')
}

record(
  'P7',
  '@hozu/runtime-client initial JS (entry + static chunks), min+gz',
  initialClientBytes(),
  'bytes',
  9 * 1024,
)

const browserDir = join(root, 'packages/runtime-client/dist/browser')
const fetchChunk = readdirSync(browserDir).find(
  (f) => f.endsWith('.js') && readFileSync(join(browserDir, f), 'utf8').includes('hozu.fetchFail'),
)
if (!fetchChunk) throw new Error('No runtime-client chunk holds the browser-effect runner (ADR 0049)')
record(
  'P11',
  '@hozu/runtime-client browser-effect runner beyond the initial JS (ADR 0049), min+gz',
  clientBytes(fetchChunk),
  'bytes',
  3 * 1024,
)

const hook = ['--import', join(root, 'packages/transform/dist/register.js')]
const p13 = spawnSync(
  process.execPath,
  ['--expose-gc', ...hook, join(root, 'bench/scale/probe.ts'), 'cache', '1000000'],
  {
    encoding: 'utf8',
  },
)
if (p13.status !== 0) throw new Error(`bench/scale/probe.ts: ${p13.stderr}`)
const cacheProbe = JSON.parse(p13.stdout) as { entries: number; heapMB: number }
record(
  'P13',
  'data cache entries after 1,000,000 distinct public keys (ADR 0050 A)',
  cacheProbe.entries,
  'entries',
  10_000,
)
record('P13', 'data cache heap growth after 1,000,000 distinct public keys', cacheProbe.heapMB, 'MB', 64)
const p9 = spawnSync(process.execPath, [...hook, join(root, 'bench/p9.ts')], { encoding: 'utf8' })
if (p9.status !== 0) throw new Error(`bench/p9.ts: ${p9.stderr}`)
record(
  'P9',
  'adapter-node requests per second, cart home (per-request render), 16 connections, median of 3',
  median(JSON.parse(p9.stdout) as number[]),
  '/s',
  null,
)

const synthetic = (features: number): number => {
  const r = spawnSync(process.execPath, [...hook, join(root, 'bench/p2.ts'), String(features)], {
    encoding: 'utf8',
  })
  if (r.status !== 0) throw new Error(`bench/p2.ts ${features}: ${r.stderr}`)
  return Math.min(...(JSON.parse(r.stdout) as number[]))
}
const sizes = [250, 500, 1000, 2000]
const best = sizes.map(() => Number.POSITIVE_INFINITY)
for (let round = 0; round < 5; round++) sizes.forEach((n, i) => (best[i] = Math.min(best[i]!, synthetic(n))))
const points = sizes.map((n, i) => [Math.log(n), Math.log(best[i]!)] as const)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const mx = mean(points.map(([x]) => x))
const my = mean(points.map(([, y]) => y))
const slope =
  points.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0) /
  points.reduce((sum, [x]) => sum + (x - mx) ** 2, 0)
record('P2', 'build + validate, 1000 features × 30 states × 10 events', best[2]!, 'ms', 500)
record(
  'P2',
  'scaling exponent, best of 5 interleaved rounds at 250–2000 features (1.14 ≙ 2× → 2.2×)',
  slope,
  '',
  1.14,
)

const bin = join(root, 'packages/cli/bin/hozu.js')
const cold: number[] = []
for (let i = 0; i < 10; i++) {
  const start = performance.now()
  const r = spawnSync(process.execPath, [bin, 'check', '--no-types', '--json'], {
    cwd: cartDir,
    encoding: 'utf8',
  })
  cold.push(performance.now() - start)
  if (r.status !== 0) throw new Error(`hozu check --no-types failed: ${r.stdout}${r.stderr}`)
}
record('P3', 'hozu check --no-types --json cold start, median of 10', median(cold), 'ms', 300)

const tsc = join(root, 'node_modules/.bin/tsc')
const diag = execFileSync(tsc, ['-p', join(cartDir, 'tsconfig.json'), '--extendedDiagnostics'], {
  encoding: 'utf8',
})
record(
  'A4',
  'type instantiations for examples/cart',
  Number(/Instantiations:\s+(\d+)/.exec(diag)?.[1] ?? Number.NaN),
  '',
  65_000,
)

const report = join(tmpdir(), `hozu-browse-budget-${process.pid}.json`)
const browse = spawnSync(
  join(root, 'node_modules/.bin/vitest'),
  ['run', 'packages/cli/test/browse.test.ts'],
  {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, HOZU_BUDGET: '1', HOZU_BUDGET_REPORT: report },
  },
)
if (existsSync(report)) {
  record(
    'B1',
    'hozu browse tests, alone: slowest run (both modes)',
    JSON.parse(readFileSync(report, 'utf8')).slowest,
    'ms',
    20_000,
  )
  rmSync(report)
  if (browse.status !== 0) {
    results.at(-1)!.ok = false
    console.log(browse.stdout.slice(-2000))
  }
} else console.log(`B1 skipped: ${browse.status === 0 ? 'no Chrome' : browse.stdout.slice(-2000)}`)

if (process.env.CHROMIUM_PATH) {
  const frameworks = spawnSync(process.execPath, ['--import', '@hozu/transform/register', 'run.ts'], {
    cwd: join(root, 'bench/frameworks'),
    encoding: 'utf8',
    env: { ...process.env, BENCH_ONLY: 'hozu', BENCH_RUNS: '1' },
  })
  const row = /\| hozu [^|]*\|(?:[^|]*\|){4}\s*([\d.]+)\s*\|/.exec(frameworks.stdout)
  record(
    'B2',
    'framework bench, Hozu row: hydrates and counts 200 clicks (interactive at, 4× CPU, one run)',
    Number(row?.[1] ?? Number.NaN),
    'ms',
    50,
  )
  if (frameworks.status !== 0 || !row) {
    results.at(-1)!.ok = false
    console.log((frameworks.stdout + frameworks.stderr).slice(-2000))
  }
} else console.log('B2 skipped: no CHROMIUM_PATH')

if (process.env.CHROMIUM_PATH) {
  const { smoothness } = await import('./smooth.ts')
  const smooth = smoothness()
  record(
    'S1',
    `elements rebuilt unchanged over the examples' browse.json (${smooth.runs} runs)`,
    smooth.flashes,
    '',
    0,
  )
  record('S2', "largest layout shift of a step over the examples' browse.json", smooth.shift, '', 0.01)
  if (smooth.problems.length) {
    results.at(-2)!.ok = false
    console.log(smooth.problems.join('\n'))
  }
} else console.log('S1, S2 skipped: no CHROMIUM_PATH')

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
