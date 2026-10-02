import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateApp } from './app.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const bin = (name: string) => join(root, 'node_modules/.bin', name)
const sizes = process.argv.slice(2).map(Number).filter(Boolean)
const repeat = 3

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

function timed(command: string, args: string[], cwd: string) {
  const started = performance.now()
  const run = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 })
  const ms = performance.now() - started
  return { ms, status: run.status, stdout: run.stdout, stderr: run.stderr }
}

function median3(command: string, args: string[], cwd: string, expect = 0) {
  const runs = Array.from({ length: repeat }, () => timed(command, args, cwd))
  const bad = runs.find((r) => r.status !== expect)
  if (bad) throw new Error(`${command} ${args.join(' ')} exited ${bad.status}\n${bad.stdout}\n${bad.stderr}`)
  return Math.round(median(runs.map((r) => r.ms)))
}

function probe(...args: string[]) {
  const run = spawnSync(
    process.execPath,
    [
      '--expose-gc',
      '--import',
      join(root, 'packages/transform/dist/register.js'),
      join(root, 'bench/scale/probe.ts'),
      ...args,
    ],
    { encoding: 'utf8', maxBuffer: 1 << 26 },
  )
  if (run.status !== 0) throw new Error(run.stderr)
  return JSON.parse(run.stdout)
}

const results: Record<string, unknown>[] = []
for (const n of sizes.length ? sizes : [50, 200, 500]) {
  const dir = join(root, 'bench/scale/out', String(n))
  generateApp(dir, n)
  const setup = timed(bin('hozu'), ['check', '--update-lock'], dir)
  if (setup.status !== 0) throw new Error(`setup failed for ${n}\n${setup.stdout}${setup.stderr}`)
  const check = median3(bin('hozu'), ['check', '--json'], dir)
  const types = median3(bin('tsc'), ['--noEmit', '-p', dir], dir)
  const validate = median3(bin('hozu'), ['validate', '--json'], dir)
  const views = join(dir, 'features/f1/views.ts')
  const original = readFileSync(views, 'utf8')
  const edits = [1, 2, 3].map((n) => {
    writeFileSync(views, original.replace("['Add']", `['Add item ${n}']`))
    const run = timed(bin('hozu'), ['check', '--json'], dir)
    if (run.status !== 0) throw new Error(`check after an edit failed\n${run.stdout}${run.stderr}`)
    return run.ms
  })
  const edit = Math.round(median(edits))
  writeFileSync(views, original)
  const app = probe('app', dir)
  results.push({
    features: n,
    checkMs: check,
    typesMs: types,
    validateMs: validate,
    editCheckMs: edit,
    ...app,
  })
  console.log(JSON.stringify(results.at(-1)))
}
for (const keys of [100_000, 1_000_000]) {
  const cache = probe('cache', String(keys))
  results.push({ cache })
  console.log(JSON.stringify(cache))
}
writeFileSync(join(root, 'bench/scale/out/results.json'), `${JSON.stringify(results, null, 2)}\n`)
const apps = results.filter((r): r is Record<string, number> => typeof r.features === 'number')
const smallest = apps.at(0)
const largest = apps.at(-1)
if (smallest && largest && smallest !== largest) {
  console.log(
    `A7 largest page's fn bytes at ${largest.features} features: ${largest.pageFnBytes} (all modules ${largest.fnsBytes})`,
  )
  const growth = (largest.payload! / smallest.payload! - 1) * 100
  const at500 = apps.find((r) => r.features === 500)
  if (at500) {
    const ok = at500.editCheckMs! <= 2600
    console.log(
      `${ok ? '✔' : '✖'} P12 hozu check after a one-line edit, 500 features: ${at500.editCheckMs} ms (budget ≤ 2600)`,
    )
    if (!ok) process.exitCode = 1
  }
  console.log(
    `A8 /f0 payload at ${largest.features} vs ${smallest.features} features: ${growth.toFixed(1)} % (target ≤ 5 %)`,
  )
}
