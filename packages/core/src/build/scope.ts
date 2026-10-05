import { assetName, assetUrl, readAsset } from '../builders/asset.ts'
import type { FeatureParts } from '../builders/feature.ts'
import { builtinOf, messageKeyOf } from '../builders/i18n.ts'
import { operatorFns } from '../builders/operators.ts'
import { onInline, type PartDecl } from '../builders/part.ts'
import type { RouteDef } from '../builders/route.ts'
import { linkOf, type NodeDef } from '../builders/ui.ts'
import { hashJson, sha256 } from '../canonical/hash.ts'
import { type At, at, join, resolveAt } from '../canonical/pointer.ts'
import { i18nFns } from '../i18n/runtime.ts'
import type { Bindings } from '../ir/bindings.ts'
import { codes } from '../ir/codes.ts'
import type { Diagnostic, DiagnosticCode, Fix, SourceIndex, SourceLoc } from '../ir/diagnostic.ts'
import { searchDefaults } from '../ir/routes.ts'
import type { GuardExpr, Json, JsonSchema, ValueExpr } from '../ir/types.ts'
import { type EscapeSite, escapesOf, loweredOf, partNamesOf } from '../lower.ts'
import { type DeclKind, infoOf } from '../model/decl.ts'
import { exprOf, guardOf, RecorderError, ReferenceEscape } from '../model/expr.ts'
import { fileUrlToPath } from '../platform.ts'
import type { SchemaAdapterDef } from '../schema/adapter.ts'
import { toCheck } from '../schema/check.ts'
import { isStandardSchema } from '../schema/standard.ts'
import type { ComponentEntry } from './components.ts'
import type { Manifest, ManifestAsset } from './manifest.ts'

export interface Owner {
  feature: string
  symbol: string
  kind: DeclKind
}

export interface PartUse {
  name: string | null
  source: SourceLoc | null
  features: string[]
  /** The element the part returns, when it returns one. */
  root: { tag: string; class: string | null } | null
  declarations: boolean
}

export const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/

export const filePath = (url: unknown): string | null =>
  typeof url === 'object' &&
  url !== null &&
  (url as URL).protocol === 'file:' &&
  typeof (url as URL).href === 'string'
    ? fileUrlToPath((url as URL).href)
    : null

export { type At, at, resolveAt }

export class ProjectScope {
  readonly diagnostics: Diagnostic[] = []
  readonly sources: SourceIndex = {}
  readonly nodes: Record<string, string> = {}
  readonly owners = new Map<object, Owner>()
  readonly features = new Map<object, string>()
  readonly routes = new Map<object, string>()
  readonly schemaCache = new Map<object, { json: JsonSchema; hash: string }>()
  adapter: SchemaAdapterDef | null = null
  basePath = ''
  manifest: Manifest | null = null
  readonly assetList: ManifestAsset[] = []
  /** What each feature's fetch.ts calls: absolute URLs' origins and the public env variables it reads (ADR 0051). */
  readonly fetchScans = new Map<string, { origins: string[]; env: string[] }>()
  readonly resolved = new WeakMap<object, ManifestAsset>()
  readonly configs = new Map<string, FeatureParts>()
  readonly parts = new Map<object, PartUse>()
  readonly components = new Map<object, ComponentEntry>()
  readonly escaped = new WeakSet<object>()
  readonly bindings: Bindings = {
    fns: {},
    fnHelpers: {},
    checks: {},
    refs: new Map(),
    styles: { entry: null, kits: {}, features: {} },
    clients: {},
    fetches: {},
    assets: {},
    assetOrder: [],
    env: { server: null, public: null },
    copies: {},
    components: {},
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
    source: SourceLoc | null = null,
  ) {
    this.diagnostics.push({
      code,
      severity: codes[code].severity,
      message,
      location: { feature, pointer: resolveAt(pointer), source },
      cause,
      fix,
    })
  }

  asset(value: unknown): ManifestAsset | null {
    const url = assetUrl(value)
    if (!url) return null
    let hit = this.resolved.get(value as object)
    if (hit) return hit
    const name = assetName(url)
    const listed = this.manifest?.assets[this.assetList.length]
    if (this.manifest && listed?.name !== name)
      throw new Error(`Asset ${name} is not in the manifest in this position; run \`hozu build\` again`)
    const file = listed ? null : readAsset(url)
    const href = this.basePath + (listed?.href ?? file!.href)
    hit = { name, href, width: listed?.width ?? file!.width, height: listed?.height ?? file!.height }
    this.resolved.set(value as object, hit)
    this.assetList.push({ ...hit, href: listed?.href ?? file!.href })
    this.bindings.assets[href] = { file: file?.file ?? null, width: hit.width, height: hit.height }
    return hit
  }

  markNode(id: string, pointer: At) {
    if (this.tracking) this.nodes[id] = resolveAt(pointer)
  }

  mark(pointer: At, value: unknown) {
    if (!this.tracking) return
    const source = infoOf(value)?.source
    if (source) this.sources[resolveAt(pointer)] = source
  }
}

const isLiteral = (v: ValueExpr): v is { literal: Json } => 'literal' in v

const foldable = (v: Json | undefined, fallback: Json | undefined) =>
  v === null || (v !== undefined && typeof v !== 'object' && v === fallback)

/** A literal search field that is null or equals the route default folds away; nothing left is `{ literal: null }`. */
export function foldSearch(search: ValueExpr, defaults: Record<string, Json>): ValueExpr {
  if ('literal' in search) {
    const l = search.literal
    if (l === null || typeof l !== 'object' || Array.isArray(l)) return search
    const kept = Object.entries(l).filter(([k, v]) => !foldable(v, defaults[k]))
    return kept.length ? { literal: Object.fromEntries(kept) } : { literal: null }
  }
  if ('object' in search) {
    const kept = Object.entries(search.object).filter(
      ([k, v]) => !('literal' in v && foldable(v.literal, defaults[k])),
    )
    return kept.length ? { object: Object.fromEntries(kept) } : { literal: null }
  }
  return search
}

const isPlainObject = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v)
  return (proto === Object.prototype || proto === null) && Object.getOwnPropertySymbols(v).length === 0
}

const where = (s: SourceLoc | null) => (s ? `${s.file.split('/').pop()}:${s.line}` : null)

const ESCAPE_FIX: Fix = {
  summary:
    'Make a helper that receives references a part(): const row = part((note) => …), called as row(note). For a global (Boolean, Array.isArray, Object.keys, String…) use an operator (!!x, x === y, x.length) or a fn()',
  snippet: 'export const row = part((note: Note) => ui.li({}, [note.pinned ? "Unpin" : "Pin"]))',
  patch: null,
}

const siteText: Record<EscapeSite[0], string> = {
  helper: 'a plain function received a reference',
  global: 'a global received a reference',
  callback: 'a plain function is used as a builder callback',
  typeof: 'typeof on a reference',
}

const partOf = new WeakMap<object, PartDecl>()
const reported = new WeakMap<object, Set<object>>()
let current: PartDecl | null = null
const active: PartDecl[] = []

const TRUE: GuardExpr = { op: 'and', args: [] }
const FALSE: GuardExpr = { op: 'or', args: [] }

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
  lowering = false
  inRender = 0

  constructor(project: ProjectScope, id: string, base = join('', 'features', id)) {
    this.project = project
    this.id = id
    this.base = base
  }

  at(...tokens: (string | number)[]): At {
    return at(this.base, ...tokens)
  }

  report(code: DiagnosticCode, pointer: At, message: string, cause: string, fix: Fix | null = null) {
    this.project.report(code, this.id, pointer, message, cause, fix)
  }

  attempt<T>(pointer: At, run: () => T, fallback: T): T {
    const previous = onInline((p, out) => this.inline(p, out, pointer))
    try {
      return run()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof ReferenceEscape)
        this.project.report(
          'HZ059',
          this.id,
          pointer,
          message,
          'A reference is a recorded placeholder: evaluating it as JavaScript gives the same answer for every value.',
          ESCAPE_FIX,
          error.source,
        )
      else
        this.report(
          'HZ014',
          pointer,
          message,
          error instanceof RecorderError
            ? (error.detail?.cause ??
                'Builder callbacks are recorded once with reference proxies; they cannot compute values.')
            : 'A builder callback threw while being recorded.',
          error instanceof RecorderError ? (error.detail?.fix ?? null) : null,
        )
      return fallback
    } finally {
      onInline(previous)
    }
  }

  callback<T>(cb: T): T {
    if (this.lowering && typeof cb === 'function' && !loweredOf().has(cb) && infoOf(cb)?.kind !== 'part')
      throw new ReferenceEscape(
        'This callback was not lowered: it is written outside the builder call and passed in through a variable or a helper, so its operators run on the placeholder. Write it inline in the builder call, or declare it with part((…) => …)',
        null,
      )
    return cb
  }

  within<T>(value: unknown, run: () => T): T {
    const part = typeof value === 'object' && value !== null ? partOf.get(value) : undefined
    if (!part) return run()
    const previous = current
    current = part
    active.push(part)
    try {
      return run()
    } finally {
      active.pop()
      current = previous
    }
  }

  private inline(part: PartDecl, out: unknown, pointer: At): unknown {
    const info = infoOf(part)
    const returned = infoOf(out)?.kind === 'node' ? (infoOf(out)!.def as NodeDef) : null
    const use = this.project.parts.get(part) ?? {
      name: partNamesOf().get(part) ?? null,
      source: info?.source ?? null,
      features: [],
      root:
        returned?.kind === 'el'
          ? {
              tag: returned.tag,
              class: typeof returned.props.class === 'string' ? returned.props.class : null,
            }
          : null,
      declarations: false,
    }
    if (!use.features.includes(this.id)) use.features.push(this.id)
    this.project.parts.set(part, use)
    this.escapes(part, pointer)
    if (typeof out === 'object' && out !== null && !partOf.has(out)) partOf.set(out, part)
    return out
  }

  escapes(value: unknown, pointer: At) {
    if (typeof value !== 'object' && typeof value !== 'function') return
    const sites = value === null ? undefined : escapesOf().get(value)
    if (!sites || this.project.escaped.has(value as object)) return
    this.project.escaped.add(value as object)
    const file = infoOf(value)?.source?.file ?? null
    const list = sites.map(
      ([kind, name, line, column]) =>
        `\`${name}\` at ${file ? `${file.split('/').pop()}:` : 'line '}${line}:${column} (${siteText[kind]})`,
    )
    this.project.report(
      'HZ059',
      this.id,
      pointer,
      `References are evaluated as JavaScript: ${list.join('; ')}`,
      'Only builder callbacks and parts are lowered to IR. A plain function or a global that receives a reference computes on the placeholder, so every value gets the same answer (a note list that always shows "Unpin").',
      ESCAPE_FIX,
      file ? { file, line: sites[0]![2], column: sites[0]![3] } : null,
    )
  }

  private foreign(decl: object, owner: Owner, pointer: At) {
    for (const part of active) {
      const use = this.project.parts.get(part)
      if (use) use.declarations = true
    }
    if (!current || owner.feature === this.id) return
    const mine = this.project.configs.get(this.id)
    const theirs = this.project.configs.get(owner.feature)
    const imported = (mine?.imports ?? []).some((f) => this.project.features.get(f) === owner.feature)
    const exported = Object.values(theirs?.exports ?? {}).some((list) => (list as object[]).includes(decl))
    if (imported && exported) return
    const seen = reported.get(current) ?? new Set()
    reported.set(current, seen)
    if (seen.has(decl)) return
    seen.add(decl)
    const use = this.project.parts.get(current)
    const name = use?.name ?? 'part'
    this.report(
      'HZ006',
      pointer,
      `${name}${where(use?.source ?? null) ? ` (${where(use!.source)})` : ''} uses ${owner.feature}.${owner.symbol}, which "${this.id}" may not use`,
      'A part that references a declaration belongs to that feature: another feature may inline it only when the owner exports the declaration and the caller imports the owner (principle 6).',
      {
        summary: `Export ${owner.symbol} from ${owner.feature} and import ${owner.feature}, or pass what the part needs as arguments`,
        snippet: `imports: [${owner.feature}]`,
        patch: null,
      },
    )
  }

  ref(decl: unknown, kinds: DeclKind[], pointer: At): string {
    const owner = this.project.owners.get(decl as object)
    if (owner && kinds.includes(owner.kind)) {
      this.foreign(decl as object, owner, pointer)
      return `${owner.feature}.${owner.symbol}`
    }
    const info = infoOf(decl)
    const expected = kinds.join(' | ')
    if (!info) {
      this.report(
        'HZ014',
        pointer,
        `Expected a ${expected} declaration, got ${describe(decl)}`,
        'Only declarations can be referenced.',
      )
    } else if (!owner) {
      const effect = kinds.includes('query') || kinds.includes('mutation')
      this.report(
        effect ? 'HZ003' : 'HZ007',
        pointer,
        `This ${info.kind} is not declared in any feature`,
        "It is referenced here but never added to a feature's `declarations`, so it has no identity.",
        {
          summary: 'Export it from a module the owning feature lists in declarations: [model, views]',
          snippet: 'export const myName = …',
          patch: null,
        },
      )
    } else {
      this.report(
        'HZ014',
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
        'HZ014',
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
        'HZ012',
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
    return this.within(g, () => this.guardOf(g, p))
  }

  private guardOf(g: unknown, p: At): GuardExpr {
    const raw = guardOf(g)
    if (raw) {
      if (raw.op === 'and' || raw.op === 'or') {
        const args = raw.args.map((a) => this.guard(a, p))
        return { op: raw.op, args: args.flatMap((a) => (a.op === raw.op ? a.args : [a])) }
      }
      if (raw.op === 'not') return { op: 'not', arg: this.guard(raw.arg, p) }
      if ('left' in raw) return { op: raw.op, left: this.value(raw.left, p), right: this.value(raw.right, p) }
    }
    const expr = exprOf(g)
    if (expr?.kind === 'call') {
      const name = builtinOf(expr.fn)
      if (name === '%cond') return this.condGuard(expr.arg as { c: unknown; a: unknown; b: unknown }, p)
      if (name?.startsWith('%')) {
        this.project.bindings.fns[name] = operatorFns[name]!
        return { op: 'fn', fn: name, arg: this.value(expr.arg, p) }
      }
      return { op: 'fn', fn: this.ref(expr.fn, ['fn'], p), arg: this.value(expr.arg, p) }
    }
    throw new RecorderError(
      'A guard must be a comparison (===, <, …), a combination with && / || / !, or a boolean fn() call',
    )
  }

  private test(x: unknown, p: At): GuardExpr {
    if (x === true) return TRUE
    if (x === false) return FALSE
    if (guardOf(x) || exprOf(x)?.kind === 'call') return this.guard(x, p)
    this.project.bindings.fns['%truthy'] = operatorFns['%truthy']!
    return { op: 'fn', fn: '%truthy', arg: this.value({ v: x }, p) }
  }

  private condGuard({ c, a, b }: { c: unknown; a: unknown; b: unknown }, p: At): GuardExpr {
    const same = (x: unknown) => {
      const e = exprOf(c)
      return (
        x === c || (e?.kind === 'call' && builtinOf(e.fn) === '%truthy' && (e.arg as { v: unknown }).v === x)
      )
    }
    const test = this.guard(c, p)
    const not: GuardExpr = { op: 'not', arg: test }
    const both = (x: GuardExpr, y: GuardExpr, op: 'and' | 'or'): GuardExpr => ({
      op,
      args: [x, y].flatMap((g) => (g.op === op ? g.args : [g])),
    })
    if (a === true && b === false) return test
    if (a === false && b === true) return not
    if (same(b) || b === false) return both(test, this.test(a, p), 'and')
    if (same(a) || a === true) return both(test, this.test(b, p), 'or')
    if (a === false) return both(not, this.test(b, p), 'and')
    if (b === true) return both(not, this.test(a, p), 'or')
    return both(both(test, this.test(a, p), 'and'), both(not, this.test(b, p), 'and'), 'or')
  }

  private searchDefaultsOf(route: unknown): Record<string, Json> {
    const schema = (infoOf(route)?.def as RouteDef | undefined)?.search
    const { adapter, schemaCache } = this.project
    if (!schema || !adapter || !isStandardSchema(schema) || schema['~standard'].vendor !== adapter.vendor)
      return {}
    let cached = schemaCache.get(schema)
    if (!cached) {
      const json = adapter.toJsonSchema(schema)
      cached = { json, hash: `s_${hashJson(json).slice(0, 16)}` }
      schemaCache.set(schema, cached)
    }
    return searchDefaults(cached.json)
  }

  value(v: unknown, pointer: At): ValueExpr {
    return this.within(v, () => this.valueOf(v, pointer))
  }

  private valueOf(v: unknown, pointer: At): ValueExpr {
    if (guardOf(v)) return { test: this.guard(v, pointer) }
    const link = linkOf(v)
    if (link && infoOf(link.route)?.kind === 'endpoint')
      return {
        endpoint: this.ref(link.route, ['endpoint'], pointer),
        input: link.params === null ? null : this.value(link.params, pointer),
      }
    if (link) {
      const route = this.project.routes.get(link.route as object)
      if (!route)
        this.report(
          'HZ007',
          pointer,
          'ui.link targets a route missing from project({ routes })',
          'Routes are identities; register the route.',
        )
      return {
        link: route ?? '?',
        params: link.params === null ? { literal: null } : this.value(link.params, pointer),
        search:
          link.search === null
            ? { literal: null }
            : foldSearch(this.value(link.search, pointer), this.searchDefaultsOf(link.route)),
      }
    }
    const file = this.project.asset(v)
    if (file) return { literal: file.href }
    const expr = exprOf(v)
    if (expr) {
      if (expr.kind === 'call') {
        const message = messageKeyOf(expr.fn)
        const name = message ? '#msg' : builtinOf(expr.fn)
        if (name) {
          this.project.bindings.fns[name] = (i18nFns[name] ?? operatorFns[name])!
          const owner = message ? this.project.owners.get(message.decl) : null
          if (message && owner) this.foreign(message.decl, owner, pointer)
          if (message && !owner)
            this.report(
              'HZ007',
              pointer,
              'These messages are not registered in any feature',
              'Add them to feature({ declarations }).',
            )
          return {
            fn: message ? `#msg:${owner?.feature ?? '?'}.${message.key}` : name,
            arg: this.value(expr.arg, pointer),
          }
        }
        return { fn: this.ref(expr.fn, ['fn'], pointer), arg: this.value(expr.arg, pointer) }
      }
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
