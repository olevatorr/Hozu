import { type JsonPatchOp, join, type ProjectIR, type QueryIR, resolveAt } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { resolveRef } from '../resolve.ts'
import { featurePointer } from '../walk.ts'

const query = (ir: ProjectIR, ref: string): QueryIR | null => {
  const r = resolveRef(ir, ref, 'query')
  return r ? (r.feature.queries[r.symbol] ?? null) : null
}

/** The patch that moves an effect to the server: `runs: 'server'`. */
const toServer = (ir: ProjectIR, ref: string, kind: 'query' | 'mutation'): JsonPatchOp[] | null => {
  const r = resolveRef(ir, ref, kind)
  if (!r) return null
  const registry = kind === 'query' ? 'queries' : 'mutations'
  return [
    {
      op: 'replace',
      path: resolveAt(join('', 'features', r.feature.id, registry, r.symbol, 'runs')),
      value: 'server',
    },
  ]
}

const serverCached = (q: QueryIR) =>
  q.runs !== 'browser' && q.scope === 'public' && !['request', 'live'].includes(q.freshness.kind)

/** HZ082: data or a refresh that only the server can provide, asked of an effect that does not run there (ADR 0049). */
export function effectRuntimes(ctx: Ctx) {
  const { ir } = ctx
  for (const [route, page] of Object.entries(ir.pages)) {
    const head = page.head.query && query(ir, page.head.query.ref)
    if (head?.runs === 'browser')
      ctx.report(
        'HZ082',
        null,
        join('', 'pages', route, 'head', 'query'),
        `The head of page ${route} reads ${page.head.query!.ref}, which runs in the browser`,
        'The head (title, description, status) is written by the server before any browser code runs.',
        {
          summary: "Read the head from a query with runs: 'server' or 'either'",
          snippet: "runs: 'server'",
          patch: toServer(ir, page.head.query!.ref, 'query'),
        },
      )
    const entries = page.entries && query(ir, page.entries.query)
    if (entries?.runs === 'browser')
      ctx.report(
        'HZ082',
        null,
        join('', 'pages', route, 'entries', 'query'),
        `The entries of page ${route} come from ${page.entries!.query}, which runs in the browser`,
        'Entries (the sitemap and static export) are listed by the server or at build time.',
        {
          summary: "List entries with a query that has runs: 'server' or 'either'",
          snippet: "runs: 'server'",
          patch: toServer(ir, page.entries!.query, 'query'),
        },
      )
  }
  const cachedTags = new Map<string, string>()
  for (const f of Object.values(ir.features))
    for (const [sym, q] of Object.entries(f.queries))
      if (serverCached(q)) for (const t of q.tags) cachedTags.set(t.tag, `${f.id}.${sym}`)
  for (const f of Object.values(ir.features))
    for (const [sym, m] of Object.entries(f.mutations)) {
      if (m.runs === 'server') continue
      m.invalidates.forEach((t, i) => {
        const reader = cachedTags.get(t.tag)
        if (!reader) return
        ctx.report(
          'HZ082',
          f.id,
          featurePointer(f.id, 'mutations', sym, 'invalidates', String(i)),
          `${f.id}.${sym} runs in the browser but invalidates ${t.tag}, which ${reader} caches on the server`,
          "A mutation that runs in the browser refreshes the page, but the server's cache never hears of it, so the next visitor gets the old data.",
          {
            summary: `Give ${reader} freshness: 'request', or make ${f.id}.${sym} runs: 'server'`,
            snippet: "runs: 'server'",
            patch: toServer(ir, `${f.id}.${sym}`, 'mutation'),
          },
        )
      })
    }
}

/** HZ081: a `connect` entry that names a public env variable the project does not declare (ADR 0051). */
export function connectEnv(ctx: Ctx) {
  const { ir } = ctx
  const declared = Object.keys((ir.env?.public?.properties ?? {}) as Record<string, unknown>)
  for (const f of Object.values(ir.features))
    f.connect.forEach((c, i) => {
      if ('env' in c && !declared.includes(c.env))
        ctx.report(
          'HZ081',
          f.id,
          join('', 'features', f.id, 'connect', String(i)),
          `connect of ${f.id} names the public env variable ${c.env}, which project({ env: { public } }) does not declare`,
          'An { env } entry is read from the parsed public environment at startup and its origin is added to CSP connect-src.',
          {
            summary: declared.length
              ? `Use one of ${declared.join(', ')}, or declare ${c.env} in env.public`
              : `Declare ${c.env} in project({ env: { public } })`,
            snippet: `env: { public: z.object({ ${c.env}: z.string().url() }) }`,
            patch: null,
          },
        )
    })
}

const SECRET = /(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL)|(^|_)(API_)?KEY$/

/** HZ084: a public variable named like a secret; HZ085: an `internal` mapping to undeclared variables (ADR 0052). */
export function envConfig(ctx: Ctx) {
  const env = ctx.ir.env
  if (!env) return
  const names = (schema: unknown) =>
    Object.keys(((schema as { properties?: object } | null)?.properties ?? {}) as object)
  const pub = names(env.public)
  const server = names(env.server)
  for (const name of pub)
    if (SECRET.test(name) && !name.startsWith('PUBLIC_') && !name.includes('PUBLISHABLE'))
      ctx.report(
        'HZ084',
        null,
        join('', 'env', 'public', 'properties', name),
        `The public env variable ${name} looks like a secret, and public values are sent to the browser`,
        'Public env is written into pages and island payloads and baked into a static export; anyone can read it.',
        {
          summary: `Move ${name} to env.server (resolvers read it as ctx.env.${name}), or rename it PUBLIC_${name} if it is meant to be public`,
          snippet: `server: z.object({ ${name}: z.string() })`,
          patch: null,
        },
      )
  for (const [key, target] of Object.entries(env.internal ?? {})) {
    const problems = [
      ...(pub.includes(key) ? [] : [`${key} is not a public variable`]),
      ...(server.includes(target) ? [] : [`${target} is not a server variable`]),
    ]
    if (problems.length)
      ctx.report(
        'HZ085',
        null,
        join('', 'env', 'internal', key),
        `env.internal maps ${key} to ${target}, but ${problems.join(' and ')}`,
        'env.internal maps a public variable (the URL the browser calls) to a server variable (the internal URL the server calls instead); without the internal value set, the public one is used.',
        {
          summary: `Declare ${key} in env.public and ${target} in env.server`,
          snippet: `public: z.object({ ${key}: z.string().url() }), server: z.object({ ${target}: z.string().url().optional() })`,
          patch: null,
        },
      )
  }
}
