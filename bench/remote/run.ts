import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProject, remoteContract } from '@hozu/core/ir'
import { createDataRuntime, remote, resolvers } from '@hozu/data'
import { goContract } from '../../packages/cli/src/gen/go.ts'
import project, { crunch, crunchRows, echo, fanout } from './project.ts'

const here = fileURLToPath(new URL('./', import.meta.url))
const build = buildProject(project)
const refs = ['work.echo', 'work.crunch', 'work.fanout']
const contract = remoteContract(build.ir, refs)
const service = join(here, 'service')
execFileSync('mkdir', ['-p', join(service, 'hozu')])
writeFileSync(join(service, 'hozu/contract.go'), goContract(contract, 'hozu'))
const binary = join(mkdtempSync(join(tmpdir(), 'hozu-remote-bench-')), 'service')
execFileSync('go', ['build', '-o', binary, '.'], { cwd: service, stdio: 'inherit' })

const SERVICE_ADDR = '127.0.0.1:4891'
const UPSTREAM_ADDR = '127.0.0.1:4892'
const child = spawn(binary, [], { env: { ...process.env, SERVICE_ADDR, UPSTREAM_ADDR }, stdio: 'inherit' })
const upstream = `http://${UPSTREAM_ADDR}/delay`
for (let i = 0; i < 100; i++) {
  try {
    await fetch(upstream)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 50))
  }
}

const ts = createDataRuntime({
  build,
  resolvers: resolvers(project, (implement) => [
    implement(echo, ({ n }) => ({ n })),
    implement(crunch, ({ rows, seed }) => crunchRows(rows, seed)),
    implement(fanout, async ({ calls }) => {
      const bodies = await Promise.all(
        Array.from({ length: calls }, (_, i) => fetch(`${upstream}?i=${i}`).then((r) => r.text())),
      )
      return { bytes: bodies.reduce((n, b) => n + b.length, 0) }
    }),
  ]),
})
const go = createDataRuntime({
  build,
  resolvers: resolvers(project, () =>
    remote(
      {
        url: `http://${SERVICE_ADDR}/effect`,
        contract: new URL('./service/hozu/contract.go', import.meta.url),
      },
      [echo, crunch, fanout],
    ),
  ),
})

type Runtime = typeof ts
const workloads: { name: string; total: number; call: (rt: Runtime, i: number) => Promise<unknown> }[] = [
  { name: 'echo (boundary only)', total: 20_000, call: (rt, i) => rt.query(echo, { n: i }) },
  {
    name: 'crunch 20k rows (CPU)',
    total: 2_000,
    call: (rt, i) => rt.query(crunch, { rows: 20_000, seed: i + 1 }),
  },
  {
    name: 'fanout 10 × 20 ms (I/O)',
    total: 2_000,
    call: (rt, i) => rt.query(fanout, { calls: 10, seed: i }),
  },
]

async function measure(rt: Runtime, w: (typeof workloads)[number], concurrency: number) {
  let next = 0
  const times: number[] = []
  const started = performance.now()
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < w.total) {
        const i = next++
        const t = performance.now()
        const r = (await w.call(rt, i)) as { ok: boolean; data?: unknown }
        if (!r.ok) throw new Error(`${w.name}: ${JSON.stringify(r)}`)
        times.push(performance.now() - t)
      }
    }),
  )
  times.sort((a, b) => a - b)
  return {
    rps: Math.round(w.total / ((performance.now() - started) / 1000)),
    p50: times[Math.floor(times.length / 2)]!.toFixed(2),
    p99: times[Math.floor(times.length * 0.99)]!.toFixed(2),
  }
}

const rows: Record<string, string | number>[] = []
try {
  const same = JSON.stringify((await ts.query(crunch, { rows: 20_000, seed: 7 })) as object)
  if (same !== JSON.stringify((await go.query(crunch, { rows: 20_000, seed: 7 })) as object))
    throw new Error('crunch answers differ between TypeScript and Go')
  for (const concurrency of [1, 32])
    for (const w of workloads)
      for (let round = 1; round <= 3; round++)
        for (const [side, rt] of [
          ['ts', ts],
          ['go', go],
        ] as const) {
          const r = await measure(
            rt,
            { ...w, total: concurrency === 1 ? Math.round(w.total / 10) : w.total },
            concurrency,
          )
          rows.push({ workload: w.name, concurrency, round, side, ...r })
        }
} finally {
  child.kill()
}
const summary = new Map<
  string,
  { workload: string; concurrency: number; side: string; rps: number[]; p50: number[] }
>()
for (const r of rows.filter((r) => r.round !== 1)) {
  const key = `${r.workload} ${r.concurrency} ${r.side}`
  const s = summary.get(key) ?? {
    workload: String(r.workload),
    concurrency: Number(r.concurrency),
    side: String(r.side),
    rps: [],
    p50: [],
  }
  s.rps.push(Number(r.rps))
  s.p50.push(Number(r.p50))
  summary.set(key, s)
}
console.log(
  `${cpus().length} cores, ${cpus()[0]?.model}; Node ${process.version}; rounds 2–3 (round 1 warms up)`,
)
console.table(
  [...summary.values()].map((s) => ({
    workload: s.workload,
    concurrency: s.concurrency,
    side: s.side,
    'req/s': s.rps.join(' / '),
    'p50 ms': s.p50.map((x) => x.toFixed(2)).join(' / '),
  })),
)
