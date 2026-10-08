import { existsSync, readdirSync } from 'node:fs'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { appModuleOf, type BuildResult } from '@hozu/core/ir'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { runBuild } from './build.ts'

export const TARGETS = ['node', 'workers', 'vercel'] as const
export type Target = (typeof TARGETS)[number]

export interface TargetOutput {
  target: Target
  out: string
  files: string[]
  /** What the platform needs from the person: env vars, a session store, a KV namespace (ADR 0073 A2). */
  needs: string[]
  next: string[]
}

const DEFAULT_OUT: Record<Target, string> = { node: '.', workers: 'dist/workers', vercel: '.vercel/output' }

const MARK: Record<'workers' | 'vercel', string> = { workers: 'wrangler.jsonc', vercel: 'config.json' }

/** Empties the output only when it is a folder this target wrote before (or empty), never the app or one above it. */
async function clearOutput(dir: string, kept: string[], target: 'workers' | 'vercel') {
  const inside = (a: string, b: string) => a === b || a.startsWith(`${b}${sep}`)
  if (kept.some((k) => inside(k, dir)))
    throw new HozuCliError(
      'usage',
      `--out ${dir} holds the app: hozu build --target ${target} empties its output`,
      [`hozu build --target ${target} --out ${DEFAULT_OUT[target]}`],
    )
  if (existsSync(dir) && readdirSync(dir).length && !existsSync(join(dir, MARK[target])))
    throw new HozuCliError(
      'usage',
      `${dir} is not empty and no earlier --target ${target} output: nothing was removed`,
      ['Choose an empty folder, or remove this one yourself'],
    )
  await rm(dir, { recursive: true, force: true })
}

/** What this app needs from any server, and what each target adds (ADR 0073 A2). */
export function needsOf(build: BuildResult, target: Target): string[] {
  const out: string[] = []
  const server = Object.keys(
    (build.ir.env?.server as { properties?: Record<string, unknown> } | null)?.properties ?? {},
  )
  if (build.ir.session) out.push('SESSION_SECRET (32+ characters): signs the session cookie')
  if (server.length) out.push(`server env: ${server.join(', ')}`)
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
  const write = async (file: string, text: string, keep = false) => {
    const path = join(dir, file)
    if (keep && existsSync(path)) return
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
    files.push(relative(cwd, path))
  }
  if (target === 'node') {
    await write('Dockerfile', DOCKERFILE, true)
    await write('.dockerignore', 'node_modules\n.git\n.hozu\n.vercel\ndist\n.env*\n!.env.example\n', true)
    return {
      target,
      out: dir,
      files,
      needs,
      next: [
        'docker build -t app .',
        'docker run -p 3000:3000 --env-file .env app   # or npm start on a Node host',
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
  await clearOutput(dir, [root, cwd], target)
  const staged = join(dir, '.build')
  await runBuild(loaded, staged, cwd)
  const assets = target === 'workers' ? 'assets' : 'static'
  await cp(join(staged, 'public'), join(dir, assets), { recursive: true })
  const entry = target === 'workers' ? 'worker.mjs' : 'functions/index.func/index.js'
  await (bundler as { bundleServer(o: object): Promise<unknown> }).bundleServer({
    source: entrySource(build, app, staged, target),
    resolveDir: root,
    outfile: join(dir, entry),
    conditions: target === 'workers' ? ['workerd', 'worker', 'browser'] : ['edge-light', 'worker', 'browser'],
  })
  files.push(relative(cwd, join(dir, entry)), `${relative(cwd, join(dir, assets))}/`)
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
      needs,
      next: [`cd ${relative(cwd, dir) || '.'} && npx wrangler deploy`],
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
  return { target, out: dir, files, needs, next: ['npx vercel deploy --prebuilt'] }
}

export function describeTarget(r: TargetOutput): string {
  const lines = [`hozu build --target ${r.target} → ${r.out}`, ...r.files.map((f) => `  wrote ${f}`)]
  if (r.needs.length) lines.push('  the platform needs:', ...r.needs.map((n) => `    - ${n}`))
  for (const n of r.next) lines.push(`next: ${n}`)
  return `${lines.join('\n')}\n`
}
