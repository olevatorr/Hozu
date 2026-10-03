import type { Json, ProjectIR, Runs } from '@hozu/core/ir'
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
}

interface Server {
  appHandlerOptions(
    app: unknown,
    host: Record<string, unknown>,
  ): Record<string, unknown> & { build: { ir: ProjectIR } }
  createHandler(options: unknown): { fetch(request: Request): Promise<Response> }
  usedClientComponents(ir: ProjectIR): string[]
}

const ORIGIN = 'http://localhost'

function effectOf(ir: ProjectIR, target: string) {
  const dot = target.indexOf('.')
  const feature = ir.features[target.slice(0, dot)]
  const sym = target.slice(dot + 1)
  const query = feature?.queries[sym]
  const mutation = feature?.mutations[sym]
  if (query) return { kind: 'query' as const, runs: query.runs }
  if (mutation) return { kind: 'mutation' as const, runs: mutation.runs }
  if (feature?.endpoints[sym])
    throw new HozuCliError('usage', `${target} is an endpoint; request its URL instead`, [
      'hozu get <its path> for a GET endpoint, hozu browse for a form that posts to it',
    ])
  const known = Object.values(ir.features).flatMap((f) => [
    ...Object.keys(f.queries).map((s) => `${f.id}.${s}`),
    ...Object.keys(f.mutations).map((s) => `${f.id}.${s}`),
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
  const { kind, runs } = effectOf(loaded.build().ir, target)
  if (runs === 'browser')
    throw new HozuCliError(
      'usage',
      `${target} runs in the browser (runs: 'browser'); the server never runs it`,
      ['hozu browse <a page that reads it>'],
    )
  if (kind === 'mutation' && !options.write)
    throw new HozuCliError(
      'usage',
      `${target} is a mutation: it writes real data, so hozu call needs --write`,
      [`hozu call ${target} --input '…' --write`],
    )
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
  const handler = server.createHandler({
    ...rest,
    onError: () => {},
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

export function describeCall(out: CallOutput): string {
  const lines = [`${out.effect}  (${out.kind}, runs: ${out.runs})  ${out.ms} ms`]
  lines.push(out.result.ok ? 'ok' : `failed: ${out.result.error}`)
  lines.push(JSON.stringify(out.result.ok ? out.result.value : out.result.data, null, 2))
  if (out.invalidated.length) lines.push(`invalidated: ${out.invalidated.join(', ')}`)
  if (out.refreshes.length) lines.push(`refreshes: ${out.refreshes.join(', ')}`)
  return `${lines.join('\n')}\n`
}
