// Usage: node report-0024.mjs [--json]
// ADR 0055: per-step cost and correctness of arms A (hozu cold), B (hozu warm) and C (nuxt), and the registered ratios.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { anatomy } from '../anatomy.mjs'

const here = new URL('.', import.meta.url).pathname
const root = join(here, 'results-0024')
const arms = { A: 'hozu/cold', B: 'hozu/warm', C: 'nuxt/run1' }

const rows = (dir) => {
  const f = join(root, dir, 'metrics.jsonl')
  if (!existsSync(f)) return new Map()
  const out = new Map()
  for (const l of readFileSync(f, 'utf8').trim().split('\n').filter(Boolean)) {
    const r = JSON.parse(l)
    out.set(r.step, r)
  }
  return out
}
const baseline = (dir, step) => {
  const f = join(root, dir, `${String(step).padStart(2, '0')}.jsonl`)
  try {
    return existsSync(f) ? anatomy(f, { version: 2 }).baseline : null
  } catch {
    return null
  }
}

const usage = (dir, step) => {
  const f = join(root, dir, `${String(step).padStart(2, '0')}.jsonl`)
  if (!existsSync(f)) return null
  const seen = new Map()
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.startsWith('{')) continue
    const r = JSON.parse(line)
    if (r.type === 'assistant' && !seen.has(r.message.id)) seen.set(r.message.id, r.message.usage)
  }
  return [...seen.values()]
}
// Per call, the warm prefix is either read from the cache (weight 0.1) or written to it (weight 1).
const prefixCost = (calls, prefix) =>
  calls.reduce((sum, u) => sum + ((u.cache_read_input_tokens ?? 0) >= prefix ? 0.1 : 1) * prefix, 0)

const data = Object.fromEntries(Object.entries(arms).map(([k, d]) => [k, rows(d)]))
const steps = [...new Set(Object.values(data).flatMap((m) => [...m.keys()]))].sort((a, b) => a - b)

const table = steps.map((step) => {
  const at = (k) => data[k].get(step)
  const w = (k) => at(k)?.cost?.weighted ?? null
  const prefix =
    baseline(arms.B, step) !== null && baseline(arms.A, step) !== null
      ? Math.max(0, baseline(arms.B, step) - baseline(arms.A, step))
      : null
  const calls = at('B')?.cost?.calls ?? 0
  const bCalls = usage(arms.B, step)
  const bNet = w('B') !== null && prefix !== null && bCalls ? w('B') - prefixCost(bCalls, prefix) : null
  const ok = (k) => (at(k)?.accept ? `${at(k).accept.passed}/${at(k).accept.total}` : null)
  return {
    step,
    A: { weighted: w('A'), calls: at('A')?.cost?.calls ?? null, accept: ok('A') },
    B: { weighted: w('B'), net: bNet === null ? null : Math.round(bNet), prefix, calls, accept: ok('B') },
    C: { weighted: w('C'), calls: at('C')?.cost?.calls ?? null, accept: ok('C') },
  }
})

const geo = (xs) => (xs.length ? Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length) : null)
const ratio = (range, f) => {
  const xs = table.filter((r) => range(r.step)).map(f).filter((x) => Number.isFinite(x) && x > 0)
  return { n: xs.length, geomean: geo(xs) }
}
const ranges = { seen: (s) => s >= 0 && s <= 20, heldout: (s) => s >= 21 && s <= 28 }
const summary = Object.fromEntries(
  Object.entries(ranges).map(([name, range]) => [
    name,
    {
      'A/B (learning)': ratio(range, (r) => r.A.weighted / r.B.weighted),
      'A/B net': ratio(range, (r) => r.A.weighted / r.B.net),
      'B/C (structure)': ratio(range, (r) => r.B.weighted / r.C.weighted),
      'B net/C': ratio(range, (r) => r.B.net / r.C.weighted),
      'A/C (today)': ratio(range, (r) => r.A.weighted / r.C.weighted),
    },
  ]),
)

if (process.argv.includes('--json')) console.log(JSON.stringify({ table, summary }, null, 2))
else {
  const k = (x) => (x === null || x === undefined ? '—' : `${Math.round(x / 1000)}k`)
  console.log('| Step | A cold | B warm (net) | C Nuxt | A/C | B net/C | A/B | Checks A · B · C |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const r of table) {
    const x = (a, b) => (a && b ? `${(a / b).toFixed(2)}×` : '—')
    console.log(
      `| ${r.step} | ${k(r.A.weighted)} | ${k(r.B.weighted)} (${k(r.B.net)}) | ${k(r.C.weighted)} | ${x(r.A.weighted, r.C.weighted)} | ${x(r.B.net, r.C.weighted)} | ${x(r.A.weighted, r.B.weighted)} | ${r.A.accept ?? '—'} · ${r.B.accept ?? '—'} · ${r.C.accept ?? '—'} |`,
    )
  }
  for (const [name, s] of Object.entries(summary)) {
    console.log(`\n${name}:`)
    for (const [label, v] of Object.entries(s))
      console.log(`  ${label.padEnd(16)} ${v.geomean ? `${v.geomean.toFixed(2)}×` : '—'}  (n = ${v.n})`)
  }
}
