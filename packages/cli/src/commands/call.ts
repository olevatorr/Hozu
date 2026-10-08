import type { EndpointIR, Json, ProjectIR, Runs, TagExprIR } from '@hozu/core/ir'
import { impact } from '@hozu/validator'
import type { CallOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { appParts } from './request.ts'

export interface CallOptions {
  target: string | undefined
  input: string | undefined
  session: string | undefined
  write: boolean
  /** Request headers for an endpoint, `Name: value` (ADR 0056 C). */
  headers?: string[]
}

interface Server {
  appHandlerOptions(
    app: unknown,
    host: Record<string, unknown>,
  ): Record<string, unknown> & { build: { ir: ProjectIR } }
  createHandler(options: unknown): { fetch(request: Request): Promise<Response> }
  usedClientComponents(ir: ProjectIR): string[]
}

interface Bus {
  publish(tags: string[]): void | Promise<void>
  subscribe(onTags: (tags: string[]) => void): () => void
  accept?(request: Request): Promise<Response>
}

const ORIGIN = 'http://localhost'

function effectOf(ir: ProjectIR, target: string) {
  const dot = target.indexOf('.')
  const feature = ir.features[target.slice(0, dot)]
  const sym = target.slice(dot + 1)
  const query = feature?.queries[sym]
  const mutation = feature?.mutations[sym]
  const endpoint = feature?.endpoints[sym]
  if (query) return { kind: 'query' as const, runs: query.runs, endpoint: null }
  if (mutation) return { kind: 'mutation' as const, runs: mutation.runs, endpoint: null }
  if (endpoint) return { kind: 'endpoint' as const, runs: 'server' as Runs, endpoint }
  const known = Object.values(ir.features).flatMap((f) => [
    ...Object.keys(f.queries).map((s) => `${f.id}.${s}`),
    ...Object.keys(f.mutations).map((s) => `${f.id}.${s}`),
    ...Object.keys(f.endpoints).map((s) => `${f.id}.${s}`),
  ])
  throw new HozuCliError('usage', `Unknown query or mutation ${target}`, known.slice(0, 20))
}

/**
 * Runs one query or mutation through the app's own handler, in process, exactly as a page or a machine would
 * (ADR 0050 F): the same resolvers, session store, schemas and invalidation. A mutation writes real data, so it
 * needs `--write`.
 */
export async function runCall(loaded: Loaded, options: CallOptions): Promise<CallOutput> {
  if (!options.target?.includes('.'))
    throw new HozuCliError('usage', 'hozu call needs <feature>.<query or mutation>', [
      `hozu call notes.listNotes --input '{}'`,
    ])
  const target = options.target
  const { kind, runs, endpoint } = effectOf(loaded.build().ir, target)
  if (runs === 'browser')
    throw new HozuCliError(
      'usage',
      `${target} runs in the browser (runs: 'browser'); the server never runs it`,
      ['hozu browse <a page that reads it>'],
    )
  const writes = kind === 'mutation' || (endpoint !== null && endpoint.method !== 'GET')
  if (writes && !options.write)
    throw new HozuCliError(
      'usage',
      `${target} is a ${kind === 'endpoint' ? `${endpoint!.method} endpoint` : 'mutation'}: it writes real data, so hozu call needs --write`,
      [`hozu call ${target} --input '…' --write`],
    )
  const headers = headersOf(options.headers ?? [])
  let input: Json
  try {
    input = JSON.parse(options.input ?? '{}') as Json
  } catch {
    throw new HozuCliError('usage', '--input must be JSON', [`--input '{"id":"n1"}'`])
  }
  const parts = await appParts(loaded, 'call', [options.session])
  const server = await parts.importFrom<Server>('@hozu/runtime-server')
  const rest = server.appHandlerOptions(parts.module.app, {
    env: process.env,
    ...(parts.session ? { session: parts.session } : {}),
  })
  const ir = rest.build.ir
  const published: string[] = []
  const bus = rest.bus as Bus | undefined
  const handler = server.createHandler({
    ...rest,
    onError: () => {},
    bus: {
      publish: (tags: string[]) => {
        published.push(...tags)
        return bus?.publish(tags)
      },
      subscribe: (onTags: (tags: string[]) => void) => bus?.subscribe(onTags) ?? (() => {}),
      ...(bus?.accept ? { accept: bus.accept.bind(bus) } : {}),
    },
    ...(rest.components || rest.manifest
      ? {}
      : {
          components: {
            urls: Object.fromEntries(server.usedClientComponents(ir).map((r) => [r, `/_hozu/c/${r}.js`])),
            files: {},
            fetches: Object.fromEntries(
              Object.values(ir.features)
                .filter((f) => f.fetch)
                .map((f) => [f.id, `/_hozu/c/fetch-${f.id}.js`]),
            ),
          },
        }),
  })
  const [cookie] = parts.cookies
  if (endpoint)
    return callEndpoint(handler, target, endpoint, ir, input, published, {
      ...headers,
      ...(cookie ? { cookie } : {}),
    })
  const started = performance.now()
  const response = await handler.fetch(
    new Request(`${ORIGIN}/_hozu/${kind === 'query' ? 'query' : 'effect'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(kind === 'query' ? { query: target, input } : { effect: target, input, keys: [] }),
    }),
  )
  const ms = Math.round(performance.now() - started)
  if (!response.ok)
    throw new HozuCliError('usage', `${target}: the server answered ${response.status}`, [
      await response.text(),
    ])
  const body = (await response.json()) as Json
  const result = (kind === 'query' ? body : (body as { result: Json }).result) as CallOutput['result']
  const invalidated = kind === 'mutation' ? ((body as { tags?: string[] }).tags ?? []) : []
  const refreshes = invalidated.length
    ? [...new Set(impact(ir, target).queries.map((q) => q.ref))].sort()
    : []
  return { effect: target, kind, runs: runs as Runs, input, result, ms, invalidated, refreshes }
}

function headersOf(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of lines) {
    const at = line.indexOf(':')
    if (at <= 0)
      throw new HozuCliError('usage', `--header takes "Name: value", not "${line}"`, [
        "--header 'Authorization: Bearer <token>'",
      ])
    out[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
  }
  return out
}

const flat = (input: Json): URLSearchParams => {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries((input ?? {}) as Record<string, Json>))
    for (const x of Array.isArray(v) ? v : [v]) if (x !== null) params.append(k, String(x))
  return params
}

/** An endpoint, called through the app's handler like any client would (ADR 0056 C): its URL, method and headers. */
async function callEndpoint(
  handler: { fetch(request: Request): Promise<Response> },
  target: string,
  e: EndpointIR,
  ir: ProjectIR,
  input: Json,
  published: string[],
  headers: Record<string, string>,
): Promise<CallOutput> {
  const query = e.method === 'GET' ? flat(input).toString() : ''
  const url = `${ORIGIN}${ir.http.basePath}${e.path}${query ? `?${query}` : ''}`
  const started = performance.now()
  const response = await handler.fetch(
    new Request(url, {
      method: e.method,
      headers: {
        origin: ORIGIN,
        ...(e.method === 'GET' ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      ...(e.method === 'GET'
        ? {}
        : { body: e.raw && typeof input === 'string' ? input : JSON.stringify(input) }),
    }),
  )
  const ms = Math.round(performance.now() - started)
  const text = await response.text()
  let body: Json = text
  try {
    body = JSON.parse(text) as Json
  } catch {}
  const ok = response.status < 400
  const error =
    !ok && body && typeof body === 'object' && 'error' in body ? String(body.error) : String(response.status)
  return {
    effect: target,
    kind: 'endpoint',
    runs: 'server',
    input,
    status: response.status,
    result: ok ? { ok: true, value: body } : { ok: false, error, data: body },
    ms,
    invalidated: [...new Set(published)],
    refreshes: published.length ? refreshedBy(ir, e.invalidates ?? []) : [],
  }
}

const refreshedBy = (ir: ProjectIR, tags: TagExprIR[]) => {
  const names = new Set(tags.map((t) => t.tag))
  const out = new Set<string>()
  for (const f of Object.values(ir.features))
    for (const [sym, q] of Object.entries(f.queries))
      if (q.tags.some((t) => names.has(t.tag))) out.add(`${f.id}.${sym}`)
  return [...out].sort()
}

export function describeCall(out: CallOutput): string {
  const lines = [
    `${out.effect}  (${out.kind}${out.kind === 'endpoint' ? '' : `, runs: ${out.runs}`})${out.status ? `  ${out.status}` : ''}  ${out.ms} ms`,
  ]
  lines.push(out.result.ok ? 'ok' : `failed: ${out.result.error}`)
  lines.push(JSON.stringify(out.result.ok ? out.result.value : out.result.data, null, 2))
  if (out.invalidated.length) lines.push(`invalidated: ${out.invalidated.join(', ')}`)
  if (out.refreshes.length) lines.push(`refreshes: ${out.refreshes.join(', ')}`)
  return `${lines.join('\n')}\n`
}
