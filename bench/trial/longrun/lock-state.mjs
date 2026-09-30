import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const child = `
const [dir] = process.argv.slice(1)
const { createRequire } = await import('node:module')
const { pathToFileURL } = await import('node:url')
const require = createRequire(dir + '/package.json')
const v = await import(pathToFileURL(require.resolve('@hozu/validator')).href)
const { load } = await import(pathToFileURL(dir + '/node_modules/@hozu/cli/dist/load.js').href)
const loaded = await load(undefined, dir)
const built = loaded.build(false)
const verified = v.verify(built.ir, { bindings: built.bindings, lock: null, accept: true })
const decides = {}
for (const [f, entries] of Object.entries(verified.lock?.features ?? {}))
  for (const [id, e] of Object.entries(entries))
    decides[f + '/' + id] = typeof e.decides === 'boolean' ? e.decides : v.isMechanical ? !v.isMechanical(built.ir.features[f], id) : null
console.log(JSON.stringify({ lock: verified.lock, decides }))
`

const flat = (lock) =>
  Object.fromEntries(
    Object.entries(lock?.features ?? {}).flatMap(([f, entries]) =>
      Object.entries(entries).map(([id, e]) => [`${f}/${id}`, e]),
    ),
  )

export function computeLock(app, ref) {
  const dir = mkdtempSync(join(tmpdir(), 'hozu-lock-'))
  try {
    execFileSync('sh', ['-c', `git -C "$0" archive "$1" | tar -x -C "$2"`, app, ref, dir])
    symlinkSync(join(app, 'node_modules'), join(dir, 'node_modules'))
    const committed = existsSync(join(dir, 'hozu.lock.json'))
      ? JSON.parse(readFileSync(join(dir, 'hozu.lock.json'), 'utf8'))
      : null
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', child, dir], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    })
    if (run.status !== 0) {
      const cli = spawnSync('npx', ['hozu', 'check', '--update-lock', '--json'], {
        cwd: dir,
        encoding: 'utf8',
      })
      const updated = existsSync(join(dir, 'hozu.lock.json'))
        ? JSON.parse(readFileSync(join(dir, 'hozu.lock.json'), 'utf8'))
        : null
      if (cli.status !== 0 && JSON.stringify(updated) === JSON.stringify(committed))
        return {
          error: (run.stderr || cli.stderr).trim().split('\n').slice(-1)[0]?.slice(0, 200) ?? 'failed',
        }
      const decides = Object.fromEntries(
        Object.entries(flat(updated)).map(([k, e]) => [k, typeof e.decides === 'boolean' ? e.decides : null]),
      )
      return { committed, computed: updated, decides }
    }
    const out = JSON.parse(run.stdout.trim().split('\n').at(-1))
    return { committed, computed: out.lock, decides: out.decides }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function lockMetrics({ committed, computed, decides, error }) {
  if (error) return { error }
  const [a, b] = [flat(committed), flat(computed)]
  const same = (x, y) => JSON.stringify(x ?? {}) === JSON.stringify(y ?? {})
  const added = Object.keys(b).filter((k) => !a[k])
  const changed = Object.keys(b).filter((k) => a[k] && a[k].behavior !== b[k].behavior)
  const unreviewed = changed.filter((k) => same(a[k].contracts, b[k].contracts))
  const orphan = Object.keys(a).filter((k) => !b[k])
  const contractsOnly = Object.keys(b).filter(
    (k) => a[k] && a[k].behavior === b[k].behavior && !same(a[k].contracts, b[k].contracts),
  )
  const copyOnly = added.filter((k) => decides[k] === false)
  return {
    committed: committed ? Object.keys(a).length : null,
    computed: Object.keys(b).length,
    uncommittedNew: copyOnly.length,
    uncommittedNewAll: added.length,
    changedWithoutContract: unreviewed.length,
    changedWithContract: changed.length - unreviewed.length,
    contractsOnly: contractsOnly.length,
    orphan: orphan.length,
    stale: added.length + changed.length + orphan.length + contractsOnly.length,
    ids: {
      uncommittedNew: copyOnly,
      uncommittedDecides: added.filter((k) => decides[k] !== false),
      changedWithoutContract: unreviewed,
      orphan,
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [app, ...refs] = process.argv.slice(2)
  for (const ref of refs) console.log(JSON.stringify({ ref, ...lockMetrics(computeLock(app, ref)) }))
}
