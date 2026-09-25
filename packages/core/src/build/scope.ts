import { fileURLToPath } from 'node:url'
import { assetOf } from '../builders/asset.ts'
import { hashJson, sha256 } from '../canonical/hash.ts'
import { type At, at, join, resolveAt } from '../canonical/pointer.ts'
import type { Bindings } from '../ir/bindings.ts'
import { codes } from '../ir/codes.ts'
import type { Diagnostic, DiagnosticCode, Fix, SourceIndex } from '../ir/diagnostic.ts'
import type { GuardExpr, Json, JsonSchema, ValueExpr } from '../ir/types.ts'
import { type DeclKind, infoOf } from '../model/decl.ts'
import { exprOf, guardOf, RecorderError } from '../model/expr.ts'
import type { SchemaAdapterDef } from '../schema/adapter.ts'
import { toCheck } from '../schema/check.ts'
import { isStandardSchema } from '../schema/standard.ts'

export interface Owner {
  feature: string
  symbol: string
  kind: DeclKind
}

export const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/

export const filePath = (url: unknown): string | null =>
  typeof url === 'object' &&
  url !== null &&
  (url as URL).protocol === 'file:' &&
  typeof (url as URL).href === 'string'
    ? fileURLToPath((url as URL).href)
    : null

export { type At, at, resolveAt }

const registryOf: Partial<Record<DeclKind, string>> = {
  event: 'events',
  query: 'queries',
  mutation: 'mutations',
  fn: 'fns',
  tag: 'tags',
  view: 'views',
  contract: 'contracts',
  widget: 'widgets',
  machine: 'machine',
  route: 'routes',
}

export class ProjectScope {
  readonly diagnostics: Diagnostic[] = []
  readonly sources: SourceIndex = {}
  readonly owners = new Map<object, Owner>()
  readonly features = new Map<object, string>()
  readonly routes = new Map<object, string>()
  readonly schemaCache = new Map<object, { json: JsonSchema; hash: string }>()
  adapter: SchemaAdapterDef | null = null
  readonly bindings: Bindings = {
    fns: {},
    checks: {},
    refs: new Map(),
    styles: { entry: null, features: {} },
    widgets: {},
    assets: {},
  }
  readonly tracking: boolean

  constructor(tracking: boolean) {
    this.tracking = tracking
  }

  report(
    code: DiagnosticCode,
    feature: string | null,
    pointer: At,
    message: string,
    cause: string,
    fix: Fix | null = null,
  ) {
    this.diagnostics.push({
      code,
      severity: codes[code].severity,
      message,
      location: { feature, pointer: resolveAt(pointer), source: null },
      cause,
      fix,
    })
  }

  mark(pointer: At, value: unknown) {
    if (!this.tracking) return
    const source = infoOf(value)?.source
    if (source) this.sources[resolveAt(pointer)] = source
  }
}

const isLiteral = (v: ValueExpr): v is { literal: Json } => 'literal' in v

const isPlainObject = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v)
  return (proto === Object.prototype || proto === null) && Object.getOwnPropertySymbols(v).length === 0
}

const describe = (v: unknown): string =>
  typeof v === 'function'
    ? 'function'
    : typeof v === 'object' && v
      ? (infoOf(v)?.kind ?? v.constructor?.name ?? 'object')
      : typeof v

export class FeatureScope {
  readonly project: ProjectScope
  readonly id: string
  readonly base: string
  readonly schemas: Record<string, JsonSchema> = {}
  stateNames: string[] = []

  constructor(project: ProjectScope, id: string) {
    this.project = project
    this.id = id
    this.base = join('', 'features', id)
  }

  at(...tokens: (string | number)[]): At {
    return at(this.base, ...tokens)
  }

  report(code: DiagnosticCode, pointer: At, message: string, cause: string, fix: Fix | null = null) {
    this.project.report(code, this.id, pointer, message, cause, fix)
  }

  attempt<T>(pointer: At, run: () => T, fallback: T): T {
    try {
      return run()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.report(
        'TN014',
        pointer,
        message,
        error instanceof RecorderError
          ? 'Builder callbacks are recorded once with reference proxies; they cannot compute values.'
          : 'A builder callback threw while being recorded.',
      )
      return fallback
    }
  }

  ref(decl: unknown, kinds: DeclKind[], pointer: At): string {
    const owner = this.project.owners.get(decl as object)
    if (owner && kinds.includes(owner.kind)) return `${owner.feature}.${owner.symbol}`
    const info = infoOf(decl)
    const expected = kinds.join(' | ')
    if (!info) {
      this.report(
        'TN014',
        pointer,
        `Expected a ${expected} declaration, got ${describe(decl)}`,
        'Only declarations can be referenced.',
      )
    } else if (!owner) {
      const effect = kinds.includes('query') || kinds.includes('mutation')
      const registry = registryOf[info.kind] ?? info.kind
      this.report(
        effect ? 'TN003' : 'TN007',
        pointer,
        `This ${info.kind} is not declared in any feature`,
        `It is referenced here but never registered in a feature's \`${registry}\` record, so it has no identity.`,
        {
          summary: `Register it under \`${registry}\` in the owning feature()`,
          snippet: `${registry}: { myName }`,
          patch: null,
        },
      )
    } else {
      this.report(
        'TN014',
        pointer,
        `Expected a ${expected} declaration, got a ${owner.kind}`,
        'The declaration kind does not fit here.',
      )
    }
    return '?'
  }

  schema(schema: unknown, pointer: At): string {
    const { adapter, schemaCache } = this.project
    const cached = isStandardSchema(schema) ? schemaCache.get(schema) : undefined
    if (cached) return this.intern(cached.hash, cached.json)
    if (!isStandardSchema(schema)) {
      this.report(
        'TN014',
        pointer,
        `Expected a schema, got ${describe(schema)}`,
        'Schemas must implement Standard Schema.',
      )
      return this.intern(null, {})
    }
    if (!adapter) return this.intern(null, {})
    const vendor = schema['~standard'].vendor
    if (vendor !== adapter.vendor) {
      this.report(
        'TN012',
        pointer,
        `Schema from "${vendor}" but the project adapter is "${adapter.vendor}"`,
        'One canonical schema form per project: every schema must come from the configured adapter.',
        { summary: `Rewrite this schema with ${adapter.vendor}`, snippet: null, patch: null },
      )
      return this.intern(null, {})
    }
    const json = adapter.toJsonSchema(schema)
    const hash = `s_${hashJson(json).slice(0, 16)}`
    schemaCache.set(schema, { json, hash })
    return this.intern(hash, json)
  }

  private intern(hash: string | null, json: JsonSchema): string {
    const key = hash ?? `s_${hashJson(json).slice(0, 16)}`
    this.schemas[key] = json
    return key
  }

  guard(g: unknown, p: At): GuardExpr {
    const raw = guardOf(g)
    if (raw) {
      if (raw.op === 'and' || raw.op === 'or')
        return { op: raw.op, args: raw.args.map((a) => this.guard(a, p)) }
      if (raw.op === 'not') return { op: 'not', arg: this.guard(raw.arg, p) }
      if ('left' in raw) return { op: raw.op, left: this.value(raw.left, p), right: this.value(raw.right, p) }
    }
    const expr = exprOf(g)
    if (expr?.kind === 'call')
      return { op: 'fn', fn: this.ref(expr.fn, ['fn'], p), arg: this.value(expr.arg, p) }
    throw new RecorderError('A guard must be an op.* comparison or a boolean fn() call')
  }

  value(v: unknown, pointer: At): ValueExpr {
    if (guardOf(v)) return { test: this.guard(v, pointer) }
    const file = assetOf(v)
    if (file) {
      this.project.bindings.assets[file.href] = { file: file.file, width: file.width, height: file.height }
      return { literal: file.href }
    }
    const expr = exprOf(v)
    if (expr) {
      if (expr.kind === 'call')
        return { fn: this.ref(expr.fn, ['fn'], pointer), arg: this.value(expr.arg, pointer) }
      return expr.ref === 'binding'
        ? { ref: 'binding', depth: expr.depth, path: [...expr.path] }
        : { ref: expr.ref, path: [...expr.path] }
    }
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return { literal: v }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new RecorderError(`Number ${v} is not valid JSON`)
      return { literal: v }
    }
    if (Array.isArray(v)) {
      const items = v.map((item) => this.value(item, pointer))
      if (items.every(isLiteral)) return { literal: items.map((i) => i.literal) }
      throw new RecorderError('Arrays may only contain literals; build derived arrays with fn()')
    }
    if (typeof v === 'object' && isPlainObject(v) && !infoOf(v)) {
      const entries = Object.entries(v).filter(([, x]) => x !== undefined)
      const object = Object.fromEntries(entries.map(([k, x]) => [k, this.value(x, pointer)]))
      const values = Object.values(object)
      return values.every(isLiteral)
        ? {
            literal: Object.fromEntries(
              Object.entries(object).map(([k, x]) => [k, (x as { literal: Json }).literal]),
            ),
          }
        : { object }
    }
    throw new RecorderError(`Unsupported value (${describe(v)}); use literals, references or fn() calls`)
  }

  json(v: unknown): Json {
    const out = this.value(v, '')
    if (!isLiteral(out)) throw new RecorderError('Expected plain JSON data without references')
    return out.literal
  }

  bind(key: string, schema: unknown) {
    const check = toCheck(schema)
    if (check) this.project.bindings.checks[key] = check
  }

  fingerprint(source: string): string {
    return sha256(source).slice(0, 16)
  }
}
