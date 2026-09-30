import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: opt } = parseArgs({
  options: {
    results: { type: 'string', default: 'results' },
    from: { type: 'string', default: '0' },
    to: { type: 'string', default: '20' },
    svg: {
      type: 'string',
      default: join(import.meta.dirname, '..', '..', '..', 'docs', 'trials', '0020-long-run.svg'),
    },
    title: { type: 'string', default: 'Trial 0020 per-step curves' },
    metrics: { type: 'string', default: 'metrics.jsonl' },
  },
})
const [from, to] = [Number(opt.from), Number(opt.to)]
const dir = resolve(import.meta.dirname, opt.results)
const runs = []
for (const fw of existsSync(dir) ? readdirSync(dir) : [])
  for (const run of readdirSync(join(dir, fw))) {
    const f = join(dir, fw, run, opt.metrics)
    if (!existsSync(f)) continue
    const rows = readFileSync(f, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    const byStep = new Map(rows.map((r) => [r.step, r]))
    const inRange = [...byStep.values()].filter((r) => r.step >= from && r.step <= to)
    runs.push({ fw, run, key: `${fw}-${run}`, rows: inRange.sort((a, b) => a.step - b.step) })
  }

const k = (n) => (n == null ? '–' : `${(n / 1000).toFixed(1)} k`)
const slope = (xs, ys) => {
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  return den ? num / den : null
}
const changes = (r) => r.rows.filter((x) => x.step >= Math.max(1, from))
const out = []
for (const r of runs) {
  out.push(`### ${r.key}`, '')
  out.push('| Step | New | Regression | Silent | Weighted | Calls | Lines | +/− | Dup % | JS list | Checks |')
  out.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const x of r.rows) {
    const a = x.accept
    const status = x.hozu
      ? `check ${x.hozu.checkOk ? 'ok' : `✗ ${x.hozu.errors}e`}${x.hozu.warnings ? ` ${x.hozu.warnings}w` : ''}, lock ${x.hozu.lockEntries} (${x.hozu.lockChanged}Δ), ${x.hozu.states}s/${x.hozu.transitions}t`
      : `tc ${x.nuxt.typecheckOk ? 'ok' : '✗'}, build ${x.nuxt.buildOk ? 'ok' : '✗'}`
    out.push(
      `| ${x.step} | ${a ? `${a.new.passed}/${a.new.total}` : '–'} | ${a?.regression.total ? `${a.regression.passed}/${a.regression.total}` : '–'} | ${(x.silentHint ?? x.silentFailure) ? 'yes' : ''} | ${k(x.cost?.weighted)} | ${x.cost?.calls ?? '–'} | ${x.size.lines} | +${x.size.added}/−${x.size.removed} | ${(x.duplication.ratio * 100).toFixed(1)} | ${x.js?.list ?? '–'} | ${status} |`,
    )
  }
  out.push('')
}
out.push(`### Slopes over steps ${Math.max(1, from)}–${to}`, '')
out.push(
  '| Run | Cost / step (k per step) | Cost per 100 lines of app | Regression failures | Silent failures | Lines / step | Dup pp / step | JS bytes / step |',
)
out.push('|---|---|---|---|---|---|---|---|')
for (const r of runs) {
  const c = changes(r).filter((x) => x.cost?.weighted)
  const steps = c.map((x) => x.step)
  const regFail = changes(r).reduce(
    (s, x) => s + (x.accept ? x.accept.regression.total - x.accept.regression.passed : 0),
    0,
  )
  const silent = changes(r).filter((x) => x.silentHint ?? x.silentFailure).length
  out.push(
    `| ${r.key} | ${(
      slope(
        steps,
        c.map((x) => x.cost.weighted),
      ) / 1000
    )?.toFixed(2)} | ${(
      (slope(
        c.map((x) => x.size.lines),
        c.map((x) => x.cost.weighted),
      ) *
        100) /
        1000
    )?.toFixed(2)} k | ${regFail} | ${silent} | ${slope(
      changes(r).map((x) => x.step),
      changes(r).map((x) => x.size.lines),
    )?.toFixed(1)} | ${(
      slope(
        changes(r).map((x) => x.step),
        changes(r).map((x) => x.duplication.ratio * 100),
      ) ?? 0
    ).toFixed(2)} | ${slope(
      changes(r)
        .filter((x) => x.js?.list)
        .map((x) => x.step),
      changes(r)
        .filter((x) => x.js?.list)
        .map((x) => x.js.list),
    )?.toFixed(0)} |`,
  )
}
console.log(out.join('\n'))

const panels = [
  ['Weighted tokens per step', (x) => x.cost?.weighted ?? null],
  ['App lines', (x) => x.size.lines],
  ['Regression failures', (x) => (x.accept ? x.accept.regression.total - x.accept.regression.passed : null)],
  ['Duplicated lines %', (x) => x.duplication.ratio * 100],
  ['Client JS on the list page (bytes)', (x) => x.js?.list ?? null],
  ['New checks failed', (x) => (x.accept ? x.accept.new.total - x.accept.new.passed : null)],
]
const W = 320
const H = 180
const pad = 34
const colors = { hozu: ['#2563eb', '#60a5fa'], nuxt: ['#16a34a', '#86efac'] }
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * 3} ${H * 2 + 30}" font-family="system-ui, sans-serif" font-size="10" role="img" aria-label="${opt.title}"><title>${opt.title}</title>`
svg += `<rect width="100%" height="100%" fill="#fff"/>`
panels.forEach(([title, get], p) => {
  const ox = (p % 3) * W
  const oy = Math.floor(p / 3) * H
  const series = runs.map((r) => ({
    r,
    pts: r.rows.map((x) => [x.step, get(x)]).filter(([, y]) => y != null),
  }))
  const max = Math.max(1, ...series.flatMap((s) => s.pts.map(([, y]) => y)))
  const sx = (s) => ox + pad + ((s - from) / Math.max(1, to - from)) * (W - pad - 12)
  const sy = (y) => oy + H - 22 - (y / max) * (H - 50)
  svg += `<text x="${ox + pad}" y="${oy + 16}" font-weight="600">${title}</text>`
  svg += `<line x1="${sx(from)}" y1="${sy(0)}" x2="${sx(to)}" y2="${sy(0)}" stroke="#999"/>`
  svg += `<text x="${ox + 4}" y="${sy(max) + 3}">${max >= 1000 ? `${Math.round(max / 1000)}k` : +max.toFixed(1)}</text><text x="${ox + 4}" y="${sy(0) + 3}">0</text>`
  for (const s of [0, 1, 2, 3, 4].map((i) => Math.round(from + ((to - from) * i) / 4)))
    svg += `<text x="${sx(s) - 3}" y="${sy(0) + 12}">${s}</text>`
  const seen = {}
  for (const { r, pts } of series) {
    const i = (seen[r.fw] ?? -1) + 1
    seen[r.fw] = i
    const color = colors[r.fw]?.[i % 2] ?? '#999'
    svg += `<polyline fill="none" stroke="${color}" stroke-width="1.6" points="${pts.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')}"/>`
  }
})
runs.forEach((r, i) => {
  const color = colors[r.fw]?.[runs.filter((x, j) => x.fw === r.fw && j < i).length % 2] ?? '#999'
  svg += `<rect x="${pad + i * 110}" y="${H * 2 + 12}" width="12" height="3" fill="${color}"/><text x="${pad + i * 110 + 16}" y="${H * 2 + 17}">${r.key}</text>`
})
svg += '</svg>'
writeFileSync(resolve(opt.svg), svg)
