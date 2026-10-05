import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
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
    return (
      execFileSync('npm', ['view', `${name}@${version}`, 'version', '--prefer-online'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === version
    )
  } catch {
    return false
  }
}

const packages = readdirSync(release)
  .filter((f) => f.endsWith('.tgz'))
  .map((f) => ({ file: join(release, f), ...manifestOf(join(release, f)) }))
const versions = [...new Set(packages.map((p) => p.version))]
if (packages.length !== 21) throw new Error(`.tmp/release holds ${packages.length} packages, not 21`)
if (versions.length !== 1) throw new Error(`the packages hold several versions: ${versions.join(', ')}`)
const version = versions[0]!
if (tag && tag !== version) throw new Error(`the tag says ${tag}, the packages ${version}`)

const npmVersion = run('npm', ['--version']).trim().split('.').map(Number) as [number, number, number]
if (
  !dryRun &&
  (npmVersion[0] < 11 ||
    (npmVersion[0] === 11 && npmVersion[1] < 5) ||
    (npmVersion[0] === 11 && npmVersion[1] === 5 && npmVersion[2] < 1))
)
  throw new Error(
    `npm ${npmVersion.join('.')} cannot publish with Trusted Publishing: it needs 11.5.1 or later (Node 24 ships it)`,
  )

const libraries = packages.filter((p) => p.name !== 'create-hozu')
const scaffold = packages.find((p) => p.name === 'create-hozu')
if (!scaffold) throw new Error('create-hozu is not in .tmp/release')

const publish = (p: (typeof packages)[number]) => {
  if (published(p.name, version)) return console.log(`already on npm: ${p.name}@${version}`)
  console.log(`${dryRun ? 'would publish' : 'publishing'} ${p.name}@${version}`)
  if (!dryRun) run('npm', ['publish', p.file, '--access', 'public', '--provenance'])
}

for (const p of libraries) publish(p)
publish(scaffold)
