// Writes the 0.7 IR and v1 lock baselines of ADR 0043 wave 0: node bench/trial/longrun/baseline-0.7/snapshot.mjs
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire, register } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../..')
const trial = join(homedir(), 'hozu-trial-0020')

if (process.argv[2] === '--ir') {
  const [, , , cli, config] = process.argv
  register('@hozu/transform/hook', pathToFileURL(cli))
  const req = createRequire(cli)
  const { buildProject, canonicalStringify } = await import(pathToFileURL(req.resolve('@hozu/core/ir')).href)
  const built = buildProject((await import(pathToFileURL(config).href)).default, { sources: false })
  const version = JSON.parse(
    readFileSync(join(dirname(req.resolve('@hozu/core/ir')), '../package.json'), 'utf8'),
  ).version
  process.stdout.write(
    canonicalStringify({ ir: built.ir, core: version, diagnostics: built.diagnostics.map((d) => d.code) }),
    () => process.exit(0),
  )
  await new Promise(() => {})
}

const scratch = mkdtempSync(join(tmpdir(), 'hozu-baseline-07-'))
const skip = (src) => !/\/(node_modules|dist|\.tmp|\.hozu)(\/|$)/.test(src)
const pretty = (value) => `${JSON.stringify(value, null, 2)}\n`
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null)

function copy(dir, modules) {
  const to = mkdtempSync(join(scratch, 'app-'))
  cpSync(dir, to, { recursive: true, filter: skip })
  symlinkSync(modules, join(to, 'node_modules'))
  return to
}

const cliOf = (dir) => {
  const own = join(dir, 'node_modules/@hozu/cli/bin/hozu.js')
  return existsSync(own) ? realpathSync(own) : join(root, 'packages/cli/bin/hozu.js')
}

function staleness(committed, computed) {
  const out = {}
  for (const fid of new Set([...Object.keys(committed?.features ?? {}), ...Object.keys(computed.features)])) {
    const before = committed?.features[fid] ?? {}
    const after = computed.features[fid] ?? {}
    const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    const d = {
      missing: ids.filter((id) => !before[id] && after[id]),
      removed: ids.filter((id) => before[id] && !after[id]),
      behavior: ids.filter((id) => before[id] && after[id] && before[id].behavior !== after[id].behavior),
      contracts: ids.filter(
        (id) =>
          before[id] &&
          after[id] &&
          JSON.stringify(before[id].contracts) !== JSON.stringify(after[id].contracts),
      ),
    }
    if (Object.values(d).some((l) => l.length)) out[fid] = d
  }
  return out
}

const manifest = []
function snapshot(name, dir, modules, source) {
  const cli = cliOf(dir)
  const ir = JSON.parse(
    execFileSync(
      process.execPath,
      [fileURLToPath(import.meta.url), '--ir', cli, join(dir, 'hozu.config.ts')],
      {
        cwd: dir,
        maxBuffer: 1 << 28,
      },
    ).toString(),
  )
  writeFileSync(join(here, `${name}.ir.json`), pretty(ir.ir))
  const work = copy(dir, modules)
  const committed = readJson(join(work, 'hozu.lock.json'))
  rmSync(join(work, 'hozu.lock.json'), { force: true })
  const run = spawnSync(process.execPath, [cli, 'validate', '--update-lock', '--json'], {
    cwd: work,
    maxBuffer: 1 << 28,
  })
  const validate = JSON.parse(run.stdout.toString())
  const computed = readJson(join(work, 'hozu.lock.json'))
  if (!computed) throw new Error(`${name}: validate --update-lock wrote no lock (${validate.lock})`)
  writeFileSync(
    join(here, `${name}.lock.json`),
    pretty({ committed, computed, stale: committed ? staleness(committed, computed) : null }),
  )
  const errors = validate.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)
  manifest.push({
    name,
    source,
    core: ir.core,
    build: ir.diagnostics,
    validate: { lock: validate.lock, errors },
  })
  console.log(
    `${name}: core ${ir.core}, lock ${committed ? 'committed' : 'none'}, validate errors ${errors.length}`,
  )
}

const rootModules = join(root, 'node_modules')
for (const app of readdirSync(join(root, 'examples')).sort()) {
  const dir = join(root, 'examples', app)
  if (existsSync(join(dir, 'hozu.config.ts')))
    snapshot(`examples-${app}`, dir, realpathSync(join(dir, 'node_modules')), `examples/${app}`)
}
snapshot('site', join(root, 'site'), realpathSync(join(root, 'site/node_modules')), 'site')

const reference = join(here, '../reference')
const replay = copy(join(reference, 'hozu'), rootModules)
snapshot('reference-hozu-base', replay, rootModules, 'bench/trial/longrun/reference/hozu (steps 0 and 1)')
for (const patch of readdirSync(join(reference, 'hozu-steps'))
  .filter((f) => /^\d\d\.patch$/.test(f))
  .sort()) {
  execFileSync('git', ['apply', '--whitespace=nowarn', join(reference, 'hozu-steps', patch)], {
    cwd: replay,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: scratch },
  })
  const step = basename(patch, '.patch')
  snapshot(`reference-hozu-s${step}`, replay, rootModules, `reference/hozu + hozu-steps/02..${step}.patch`)
}

for (const run of ['hozu-run1', 'hozu-run2']) {
  const app = join(trial, run, 'app')
  const dir = mkdtempSync(join(scratch, `${run}-`))
  execFileSync('sh', ['-c', `git -C "${app}" archive s12 | tar -x -C "${dir}"`])
  const modules = realpathSync(join(app, 'node_modules'))
  symlinkSync(modules, join(dir, 'node_modules'))
  snapshot(`trial0020-${run}-s12`, dir, modules, `~/hozu-trial-0020/${run}/app tag s12`)
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
writeFileSync(join(here, 'manifest.json'), pretty({ commit, node: process.version, snapshots: manifest }))
execFileSync(join(rootModules, '.bin/biome'), ['format', '--write', here], { cwd: root, stdio: 'ignore' })
rmSync(scratch, { recursive: true, force: true })
