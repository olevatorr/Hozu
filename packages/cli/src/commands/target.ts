import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { appModuleOf, type BuildResult } from '@hozu/core/ir'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { remoteGroups } from '../remote.ts'
import { inspectApp } from './app.ts'
import { runBuild } from './build.ts'

export const TARGETS = ['node', 'workers', 'vercel'] as const
export type Target = (typeof TARGETS)[number]

export interface TargetOutput {
  target: Target
  out: string
  files: string[]
  /** Files that were there already and were not overwritten (ADR 0076 A5). */
  kept: string[]
  /** What the platform needs from the person: env vars, a session store, a KV namespace (ADR 0073 A2). */
  needs: string[]
  next: string[]
}

const DEFAULT_OUT: Record<Target, string> = { node: '.', workers: 'dist/workers', vercel: '.vercel/output' }

const MARK: Record<'workers' | 'vercel', string> = { workers: 'wrangler.jsonc', vercel: 'config.json' }

/** Empties the output only when it is a folder this target wrote before (or empty), never the app or one above it. */
async function clearOutput(dir: string, kept: string[], target: 'workers' | 'vercel', cwd: string) {
  const inside = (a: string, b: string) => a === b || a.startsWith(`${b}${sep}`)
  if (kept.some((k) => inside(k, dir)))
    throw new HozuCliError(
      'usage',
      `--out ${shownPath(cwd, dir)} holds the app: hozu build --target ${target} empties its output`,
      [`hozu build --target ${target} --out ${DEFAULT_OUT[target]}`],
    )
  if (
    existsSync(dir) &&
    readdirSync(dir).length &&
    !existsSync(join(dir, MARK[target])) &&
    !existsSync(join(dir, '.build', 'manifest.json'))
  )
    throw new HozuCliError(
      'usage',
      `${shownPath(cwd, dir)} is not empty and no earlier --target ${target} output: nothing was removed`,
      ['Choose an empty folder, or remove this one yourself'],
    )
  await rm(dir, { recursive: true, force: true })
}

/** What this app needs from any server, and what each target adds (ADR 0073 A2). */
export function needsOf(build: BuildResult, target: Target): string[] {
  const out: string[] = []
  const schema = build.ir.env?.server as {
    properties?: Record<string, { default?: unknown }>
    required?: string[]
  } | null
  const server = Object.entries(schema?.properties ?? {})
  const required = server
    .filter(([k, p]) => schema?.required?.includes(k) && p.default === undefined)
    .map(([k]) => k)
  const optional = server.filter(([, p]) => p.default !== undefined).map(([k]) => k)
  if (build.ir.session) out.push('SESSION_SECRET (32+ characters): signs the session cookie')
  if (required.length) out.push(`server env: ${required.join(', ')}`)
  if (optional.length) out.push(`server env with a default (set only to change it): ${optional.join(', ')}`)
  const site = build.ir.site
  if (
    site &&
    !site.urlEnv &&
    /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)(?=[:/]|$)/.test(site.url)
  )
    out.push(
      `site.url is ${site.url}: canonical links, Open Graph and the sitemap will point there; set the public address (or site.url: { env: 'SITE_URL' })`,
    )
  if (build.ir.session && target === 'workers')
    out.push(
      'a KV namespace bound as SESSIONS: npx wrangler kv namespace create SESSIONS, then its id in wrangler.jsonc',
    )
  if (build.ir.session && target === 'vercel')
    out.push(
      'a session store shared by every instance: app({ session: kvSessions(kv, { secret }) }) over a KV you choose (memory sessions are per instance)',
    )
  const live = Object.values(build.ir.features).some((f) =>
    Object.values(f.queries).some((q) => (q.freshness as { kind: string }).kind === 'live'),
  )
  if (live && target === 'vercel')
    out.push("live queries keep a stream open: check your Vercel plan's duration limit")
  return out
}

const entrySource = (build: BuildResult, app: string, at: string, target: 'workers' | 'vercel') => {
  const fetches = Object.entries(build.bindings.fetches)
    .map(([feature, file]) => `${JSON.stringify(feature)}: () => import(${JSON.stringify(file)})`)
    .join(', ')
  const session = build.ir.session
    ? target === 'workers'
      ? ', ...(env.SESSIONS ? { session: kvSessions(env.SESSIONS, { secret: env.SESSION_SECRET }) } : {})'
      : ''
    : ''
  return [
    `import { createHandler${session ? ', kvSessions' : ''} } from '@hozu/runtime-server'`,
    `import app from ${JSON.stringify(app)}`,
    `import * as render from ${JSON.stringify(join(at, 'server/render.js'))}`,
    `import manifest from ${JSON.stringify(join(at, 'manifest.json'))}`,
    `const modules: Record<string, () => Promise<unknown>> = { ${fetches} }`,
    'const fetches = async (feature: string) => ((await modules[feature]?.()) ?? null) as never',
    'let handler: { fetch(request: Request): Promise<Response> } | undefined',
    target === 'workers'
      ? `export default { fetch(request: Request, env: Record<string, any>) { handler ??= createHandler(app, { manifest: manifest as never, render, env, fetches${session} }); return handler.fetch(request) } }`
      : 'export default (request: Request) => (handler ??= createHandler(app, { manifest: manifest as never, render, env: process.env, fetches })).fetch(request)',
    '',
  ].join('\n')
}

interface Bundler {
  bundleServer(o: object): Promise<{ node: string[] }>
}

const CONDITIONS: Record<'workers' | 'vercel', string[]> = {
  workers: ['workerd', 'worker', 'browser'],
  vercel: ['edge-light', 'worker', 'browser'],
}

const PLATFORM: Record<'workers' | 'vercel', string> = {
  workers: 'Cloudflare Workers',
  vercel: 'Vercel Edge',
}

/** The build stops when an import needs Node, naming the chain from the app file and the ways out (ADR 0075 A1). */
const nodeOnly = (target: 'workers' | 'vercel', node: string[]) =>
  new HozuCliError(
    'build',
    `hozu build --target ${target} bundles no Node built-ins for ${PLATFORM[target]}${target === 'workers' ? " (Cloudflare's nodejs_compat stays off)" : ''}, and these imports need them:\n${node.map((n) => `  ${n}`).join('\n')}`,
    [
      'hozu build --target node   # these modules run there as they are',
      "or read the data through a driver that speaks HTTP (or the platform's own database binding)",
      'or move those effects to a service with remote()   (hozu docs data --more)',
    ],
  )

const bundleFailure = (error: unknown) => {
  const errors = (error as { errors?: { text: string; location?: { file: string; line: number } | null }[] })
    .errors
  if (!errors?.length) return String(error)
  return `the server bundle has ${errors.length} error${errors.length === 1 ? '' : 's'}:\n${errors
    .map((e) => `  ${e.location ? `${e.location.file}:${e.location.line}  ` : ''}${e.text}`)
    .join('\n')}`
}

/** An env value on a loopback host, shown without its credentials; null otherwise. */
export function loopback(value: string): string | null {
  const local = (host: string) =>
    host === 'localhost' || host === '[::1]' || host === '::1' || /^127\./.test(host)
  let url: URL | null = null
  try {
    url = new URL(value)
  } catch {}
  if (url?.hostname) {
    if (!local(url.hostname)) return null
    url.username = ''
    url.password = ''
    return url.href.replace(/\/$/, '')
  }
  const m = /^([a-z][\w+.-]*:\/\/)(?:.*@)?(localhost|127\.\d+\.\d+\.\d+|\[::1\])([:/?].*)?$/i.exec(value)
  if (m) return `${m[1]}${m[2]}${m[3] ?? ''}`
  return local(value.replace(/:\d+$/, '')) ? value : null
}

/** The Go module of a remote() contract (the nearest go.mod above it, inside the app), unless app code lives there. */
function serviceRoot(contract: string, root: string): string | null {
  for (let dir = dirname(contract); dir.startsWith(`${root}${sep}`); dir = dirname(dir)) {
    if (!existsSync(join(dir, 'go.mod'))) continue
    const ts = (d: string): boolean =>
      readdirSync(d, { withFileTypes: true }).some((e) =>
        e.isDirectory()
          ? e.name !== 'node_modules' && !e.name.startsWith('.') && ts(join(d, e.name))
          : /\.[cm]?tsx?$/.test(e.name),
      )
    return ts(dir) ? null : dir
  }
  return null
}

/** The env values the CLI reads for the app (.env files), to warn about loopback hosts in a container. */
const envOf = (loaded: Loaded): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const file of new Set(['.env', ...loaded.envFiles])) {
    const text = existsSync(join(dirname(loaded.path), file))
      ? readFileSync(join(dirname(loaded.path), file), 'utf8')
      : ''
    for (const line of text.split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (!m) continue
      const raw = m[2]!.trim()
      out[m[1]!] = /^(["']).*\1$/.test(raw) ? raw.slice(1, -1) : raw.replace(/\s+#.*$/, '')
    }
  }
  return out
}

/** What the app's `.gitignore` keeps out of git, which the image leaves out too (ADR 0082 A4). */
function gitIgnored(root: string): string[] {
  const file = join(root, '.gitignore')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim().replace(/^\//, '').replace(/\/$/, ''))
    .filter((l) => l && !l.startsWith('#'))
}

const NOT_DATA = /^(\..*|node_modules|dist|build|out|coverage|tmp|temp|logs?)$/

/** A named volume for each folder the app keeps out of git and writes at runtime, such as a data folder (A5). */
const volumes = (root: string, gitignored: string[], image: string) =>
  [...new Set(gitignored.map((e) => e.replace(/\/\*+$/, '')))]
    .filter(
      (e) =>
        !NOT_DATA.test(e) &&
        !/[*!/]/.test(e) &&
        existsSync(join(root, e)) &&
        statSync(join(root, e)).isDirectory(),
    )
    .map((e) => ` -v ${image}-${e.replace(/[^\w.-]/g, '-')}:/app/${e}`)
    .join('')

/** A path as output shows it: relative inside the current folder, absolute outside it (ADR 0078 A4). */
const shownPath = (cwd: string, p: string): string => {
  const r = relative(cwd, p) || '.'
  return r === '..' || r.startsWith(`..${sep}`) ? p : r
}

/** A shown path quoted for a shell line, when it needs quotes. */
const shellPath = (cwd: string, p: string): string => {
  const shown = shownPath(cwd, p)
  return /^[\w@%+=:,./-]+$/.test(shown) ? shown : `'${shown.replace(/'/g, `'\\''`)}'`
}

/** The image name: package.json's `name` as Docker accepts it, one path component (ADR 0077 A9). */
export const imageName = (root: string): string => {
  const pkg = join(root, 'package.json')
  const name = existsSync(pkg) ? (JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string }).name : undefined
  const parts = (name ?? '')
    .toLowerCase()
    .replace(/^@/, '')
    .split('/')
    .map((part) =>
      part
        .replace(/[^a-z0-9]+/g, (s) => (/^[._-]$/.test(s) ? s : '-'))
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''),
    )
    .filter(Boolean)
  return parts.join('-') || 'app'
}

const DOCKERFILE = `FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
CMD ["npx", "hozu", "serve"]
`

export async function runTarget(
  loaded: Loaded,
  target: Target,
  out: string | undefined,
  cwd: string,
): Promise<TargetOutput> {
  const build = loaded.build(false)
  const root = dirname(loaded.path)
  const dir = resolve(target === 'node' && out === undefined ? root : cwd, out ?? DEFAULT_OUT[target])
  const needs = needsOf(build, target)
  const files: string[] = []
  const kept: string[] = []
  const write = async (file: string, text: string, keep = false) => {
    const path = join(dir, file)
    if (keep && existsSync(path)) {
      kept.push(shownPath(cwd, path))
      return
    }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
    files.push(shownPath(cwd, path))
  }
  const services = await inspectApp(loaded, build)
    .then(({ module }) => (module ? remoteGroups(loaded, build, module.options.resolvers) : []))
    .catch(() => [])
  for (const s of services)
    needs.push(
      `the service ${s.url} names (remote(), contract ${relative(root, s.file)}): deploy it too, where the app can reach it`,
    )
  if (target === 'node') {
    for (const [name, value] of Object.entries(envOf(loaded))) {
      const shown = loopback(value)
      if (shown)
        needs.push(
          `${name} points at this machine (${shown}): inside a container that is the container itself; use the host's address (host.docker.internal on Docker Desktop)`,
        )
    }
    const ignored = services
      .map((s) => serviceRoot(s.file, root))
      .filter((d): d is string => d !== null)
      .map((d) => relative(root, d))
    const gitignored = gitIgnored(root)
    const lines = [
      'node_modules',
      '.git',
      '.hozu',
      '.vercel',
      'dist',
      '.env*',
      '!.env.example',
      'production.env',
      '.claude',
      '.agents',
      'CLAUDE.md',
      'AGENTS.md',
      ...ignored,
    ]
    for (const entry of gitignored) if (!lines.includes(entry)) lines.push(entry)
    const ignoreName = dir === root ? '.dockerignore' : 'Dockerfile.dockerignore'
    const ignore = join(dir, ignoreName)
    if (existsSync(ignore)) {
      const has = new Set(
        readFileSync(ignore, 'utf8')
          .split('\n')
          .map((l) => l.trim().replace(/^\/|\/$/g, '')),
      )
      const missing = lines.filter((l) => !has.has(l))
      if (missing.length)
        needs.push(
          `the kept ${shownPath(cwd, ignore)} lacks: ${missing.join(', ')} (add them, or the image copies them)`,
        )
    }
    await write('Dockerfile', DOCKERFILE, true)
    await write(ignoreName, `${lines.join('\n')}\n`, true)
    const at = (p: string) => shellPath(cwd, p)
    const image = imageName(root)
    const secrets = needs.some((n) => n.startsWith('SESSION_SECRET') || n.startsWith('server env:'))
    return {
      target,
      out: dir,
      files,
      kept,
      needs,
      next: [
        dir === root
          ? `docker build -t ${image} ${at(root)}`
          : `docker build -f ${at(join(dir, 'Dockerfile'))} -t ${image} ${at(root)}   # the app is the build context`,
        `docker run -p 3000:3000${secrets ? ` --env-file ${at(join(root, 'production.env'))}` : ''}${volumes(root, gitignored, image)} ${image}   #${secrets ? ' production.env holds the values above, not your development .env (keep it out of git);' : ''} or npm start on a Node host`,
      ],
    }
  }
  const app = appModuleOf(loaded.project)
  if (!app)
    throw new HozuCliError('config', 'project({ app }) names no app module', [
      "app: new URL('./app.ts', import.meta.url)",
    ])
  const require = createRequire(loaded.path)
  let bundler: unknown
  try {
    bundler = await import(pathToFileURL(require.resolve('@hozu/bundle')).href)
  } catch {
    throw new HozuCliError(
      'build',
      `hozu build --target ${target} needs @hozu/bundle installed in the project`,
      ['npm install -D @hozu/bundle'],
    )
  }
  await clearOutput(dir, [root, cwd], target, cwd)
  let made = dir
  while (!existsSync(dirname(made))) made = dirname(made)
  const staged = join(dir, '.build')
  const assets = target === 'workers' ? 'assets' : 'static'
  const entry = target === 'workers' ? 'worker.mjs' : 'functions/index.func/index.js'
  try {
    await runBuild(loaded, staged, cwd)
    await cp(join(staged, 'public'), join(dir, assets), { recursive: true })
    const { node } = await (bundler as Bundler).bundleServer({
      source: entrySource(build, app, staged, target),
      resolveDir: root,
      outfile: join(dir, entry),
      conditions: CONDITIONS[target],
    })
    if (node.length) throw nodeOnly(target, node)
  } catch (error) {
    await rm(made, { recursive: true, force: true })
    throw error instanceof HozuCliError ? error : new HozuCliError('build', bundleFailure(error), [])
  }
  files.push(shownPath(cwd, join(dir, entry)), `${shownPath(cwd, join(dir, assets))}/`)
  await rm(staged, { recursive: true, force: true })
  if (target === 'workers') {
    const name = (build.ir.site?.name ?? 'hozu-app')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    await write(
      'wrangler.jsonc',
      `${JSON.stringify(
        {
          name: name || 'hozu-app',
          main: 'worker.mjs',
          compatibility_date: '2026-10-01',
          assets: { directory: 'assets' },
          vars: { NODE_ENV: 'production' },
          ...(build.ir.session
            ? {
                kv_namespaces: [
                  { binding: 'SESSIONS', id: 'set by: npx wrangler kv namespace create SESSIONS' },
                ],
              }
            : {}),
        },
        null,
        2,
      )}\n`,
    )
    return {
      target,
      out: dir,
      files,
      kept,
      needs,
      next: [`cd ${shellPath(cwd, dir)} && npx wrangler deploy`],
    }
  }
  await write(
    'functions/index.func/.vc-config.json',
    `${JSON.stringify({ runtime: 'edge', entrypoint: 'index.js' }, null, 2)}\n`,
  )
  await write(
    'config.json',
    `${JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }] }, null, 2)}\n`,
  )
  return { target, out: dir, files, kept, needs, next: ['npx vercel deploy --prebuilt'] }
}

export function describeTarget(r: TargetOutput, cwd: string): string {
  const lines = [
    `hozu build --target ${r.target} → ${shownPath(cwd, r.out)}`,
    ...r.files.map((f) => `  wrote ${f}`),
    ...r.kept.map((f) => `  kept ${f} (it was there; not overwritten)`),
  ]
  if (r.needs.length) lines.push('  the platform needs:', ...r.needs.map((n) => `    - ${n}`))
  for (const n of r.next) lines.push(`next: ${n}`)
  return `${lines.join('\n')}\n`
}

/**
 * Whether Workers and Vercel Edge can serve this app, from the build `hozu build` just wrote (ADR 0075 A3): the Node
 * built-ins its imports need, or null when `@hozu/bundle` is not installed to tell.
 */
export type EdgeCheck = { node: string[] } | { unavailable: true } | { failed: string }

export async function edgeCheck(loaded: Loaded, built: string): Promise<EdgeCheck> {
  const app = appModuleOf(loaded.project)
  if (!app) return { unavailable: true }
  let bundler: Bundler
  try {
    bundler = (await import(
      pathToFileURL(createRequire(loaded.path).resolve('@hozu/bundle')).href
    )) as Bundler
  } catch {
    return { unavailable: true }
  }
  try {
    const { node } = await bundler.bundleServer({
      source: entrySource(loaded.build(false), app, built, 'workers'),
      resolveDir: dirname(loaded.path),
      outfile: join(built, '.edge-check.mjs'),
      conditions: CONDITIONS.workers,
      write: false,
    })
    return { node }
  } catch (error) {
    return { failed: bundleFailure(error) }
  }
}

export function describeTargets(check: EdgeCheck): string {
  if ('unavailable' in check)
    return 'targets: node · workers and vercel: npm install -D @hozu/bundle to check them (a static host: hozu export)\n'
  if ('failed' in check) return `targets: node · workers and vercel could not be checked: ${check.failed}\n`
  const node = check.node
  if (!node.length)
    return 'targets: node, workers and vercel can each serve this app: hozu build --target <one> (a static host: hozu export)\n'
  return `targets: node can serve this app; workers and vercel cannot, these imports need Node:\n${node.map((n) => `  ${n}`).join('\n')}\n`
}
