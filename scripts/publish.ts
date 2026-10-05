import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const release = join(root, '.tmp/release')
const dryRun = process.argv.includes('--dry-run')
const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME?.replace(/^v/, '') : undefined

const run = (cmd: string, args: string[], cwd = root) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
const manifestOf = (file: string) =>
  JSON.parse(run('tar', ['-xzOf', file, 'package/package.json'])) as { name: string; version: string }
const published = (name: string, version: string) => {
  try {
    return run('npm', ['view', `${name}@${version}`, 'version', '--prefer-online']).trim() === version
  } catch {
    return false
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function visible(names: string[], version: string) {
  for (let i = 0; i < 60; i++) {
    const missing = names.filter((n) => !published(n, version))
    if (!missing.length) return
    console.log(`waiting for npm: ${missing.join(' ')}`)
    await sleep(15_000)
  }
  throw new Error(`npm does not show ${version} of every package after 15 minutes`)
}

const packages = readdirSync(release)
  .filter((f) => f.endsWith('.tgz'))
  .map((f) => ({ file: join(release, f), ...manifestOf(join(release, f)) }))
const versions = [...new Set(packages.map((p) => p.version))]
if (packages.length !== 21) throw new Error(`.tmp/release holds ${packages.length} packages, not 21`)
if (versions.length !== 1) throw new Error(`the packages hold several versions: ${versions.join(', ')}`)
const version = versions[0]!
if (tag && tag !== version) throw new Error(`the tag says ${tag}, the packages ${version}`)

const libraries = packages.filter((p) => p.name !== 'create-hozu')
const scaffold = packages.find((p) => p.name === 'create-hozu')
if (!scaffold) throw new Error('create-hozu is not in .tmp/release')

const publish = (p: (typeof packages)[number]) => {
  if (published(p.name, version)) return console.log(`already on npm: ${p.name}@${version}`)
  console.log(`${dryRun ? 'would publish' : 'publishing'} ${p.name}@${version}`)
  if (!dryRun) run('npm', ['publish', p.file, '--access', 'public', '--provenance'])
}

for (const p of libraries) publish(p)
if (!dryRun)
  await visible(
    libraries.map((p) => p.name),
    version,
  )
publish(scaffold)
if (dryRun) process.exit(0)
await visible([scaffold.name], version)

const dir = mkdtempSync(join(tmpdir(), 'hozu-release-'))
run('npx', ['-y', `create-hozu@${version}`, 'app', '--agent', 'claude'], dir)
run('npm', ['install', '--no-audit', '--no-fund'], join(dir, 'app'))
console.log(run('npx', ['hozu', 'check'], join(dir, 'app')).trim().split('\n').at(-1))
console.log(`✔ ${version}: 21 packages on npm, and a new app installs and checks`)
