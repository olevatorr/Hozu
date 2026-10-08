import { randomBytes } from 'node:crypto'
import type {
  RequestElement,
  RequestForm,
  RequestFormButton,
  RequestFormField,
  RequestFormGroup,
  RequestOutput,
  RequestStep,
  ServerError,
} from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { importer, requireApp } from './app.ts'

interface TestPage {
  status: number
  headers: Headers
  html: string
  text: string
}

interface TestApp {
  get(path: string, init?: RequestInit): Promise<TestPage>
}

type TestingModule = { testApp(app: unknown, options: Record<string, unknown>): TestApp }

const LIMIT = 1500

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const attrsOf = (source: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const m of source.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) out[m[1]!.toLowerCase()] = decode(m[2] ?? '')
  return out
}

const plain = (html: string) =>
  decode(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

interface Owned {
  form: number | null
  outside: boolean
}

export function formsOf(html: string, at: string): RequestForm[] {
  const source = html.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, (m) => ' '.repeat(m.length))
  const forms: RequestForm[] = []
  const byId = new Map<string, number>()
  for (const m of source.matchAll(/<form\b([^>]*)>/gi)) {
    const attrs = attrsOf(m[1]!)
    if (attrs.id) byId.set(attrs.id, forms.length)
    forms.push({
      action: attrs.action || at,
      method: (attrs.method ?? 'get').toLowerCase() === 'post' ? 'post' : 'get',
      id: attrs.id ?? null,
      label: attrs['aria-label'] ?? null,
      fields: [],
      groups: [],
      buttons: [],
    })
  }
  let current: number | null = null
  let seen = -1
  const owner = (attrs: Record<string, string>): Owned => {
    if (attrs.form === undefined) return { form: current, outside: false }
    const form = byId.get(attrs.form) ?? null
    return { form, outside: form !== current }
  }
  const closing = (tag: string, from: number) => {
    const end = source.slice(from).search(new RegExp(`</${tag}>`, 'i'))
    return end < 0 ? source.length : from + end
  }
  for (const m of source.matchAll(/<(\/?)(form|input|select|textarea|button)\b([^>]*)>/gi)) {
    const [, slash, raw, rest] = m
    const tag = raw!.toLowerCase()
    if (tag === 'form') {
      current = slash ? null : ++seen
      continue
    }
    if (slash) continue
    const attrs = attrsOf(rest!)
    const { form, outside } = owner(attrs)
    if (form === null || (!attrs.name && tag !== 'button' && attrs.type !== 'submit')) continue
    const f = forms[form]!
    const start = m.index + m[0].length
    const field = (value: string, kind: string): RequestFormField => ({
      name: attrs.name!,
      value,
      kind,
      outside,
    })
    if (tag === 'textarea')
      f.fields.push(field(decode(source.slice(start, closing('textarea', start))), 'textarea'))
    else if (tag === 'select') {
      const body = source.slice(start, closing('select', start))
      const options = [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<option\b|<\/option>|$)/gi)].map(
        (o) => {
          const a = attrsOf(o[1]!)
          return { value: a.value ?? plain(o[2]!), checked: 'selected' in a }
        },
      )
      if ('multiple' in attrs) f.groups.push({ name: attrs.name!, type: 'select', options, outside })
      else {
        const chosen = options.find((o) => o.checked) ?? options[0]
        f.fields.push(field(chosen?.value ?? '', 'select'))
      }
    } else if (tag === 'button' || ['submit', 'image'].includes(attrs.type ?? '')) {
      const type = attrs.type ?? 'submit'
      if (!['submit', 'image'].includes(type)) continue
      const text =
        tag === 'button' ? plain(source.slice(start, closing('button', start))) : (attrs.value ?? 'Submit')
      f.buttons.push({
        text,
        name: attrs.name ?? null,
        value: attrs.name ? (attrs.value ?? '') : null,
        outside,
      })
    } else {
      const type = (attrs.type ?? 'text').toLowerCase()
      if (['button', 'reset', 'file'].includes(type)) continue
      if (type === 'checkbox' || type === 'radio') {
        let group = f.groups.find((g) => g.name === attrs.name && g.type === type)
        if (!group) {
          group = { name: attrs.name!, type, options: [], outside }
          f.groups.push(group)
        }
        group.outside ||= outside
        group.options.push({ value: attrs.value ?? 'on', checked: 'checked' in attrs })
      } else f.fields.push(field(attrs.value ?? '', type))
    }
  }
  return forms
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

const HIDDEN = new Set(['script', 'style', 'template'])

const SELECTOR_FORMS = [
  'button',
  '#id',
  '[role=alert]',
  'a[href]',
  'input[name=title]',
  'meta[property^="og:"]',
  'nav a[aria-current]',
  'main > form input',
]

type AttrOp = '=' | '^=' | '$=' | '*=' | '~='

interface AttrTest {
  name: string
  op: AttrOp
  value: string | undefined
}

interface Compound {
  tag: string | undefined
  id: string | undefined
  attrs: AttrTest[]
}

interface Step {
  compound: Compound
  child: boolean
}

const unsupported = (selector: string) =>
  new HozuCliError('usage', `Unsupported selector "${selector}"`, SELECTOR_FORMS)

const compoundOf = (part: string, selector: string): Compound => {
  const m = /^([a-z][\w-]*)?(?:#([\w-]+))?((?:\[[^\]]*\])*)$/i.exec(part)
  if (!m || (!m[1] && !m[2] && !m[3])) throw unsupported(selector)
  const attrs: AttrTest[] = []
  for (const a of m[3]!.match(/\[[^\]]*\]/g) ?? []) {
    const t = /^\[([\w:-]+)(?:([~^$*]?=)(?:"([^"]*)"|'([^']*)'|([^"'\]]*)))?\]$/.exec(a)
    if (!t) throw unsupported(selector)
    attrs.push({
      name: t[1]!.toLowerCase(),
      op: (t[2] ?? '=') as AttrOp,
      value: t[2] === undefined ? undefined : (t[3] ?? t[4] ?? t[5]!),
    })
  }
  return { tag: m[1]?.toLowerCase(), id: m[2], attrs }
}

const stepsOf = (selector: string): Step[] => {
  const parts: string[] = []
  const joins: boolean[] = []
  let word = ''
  let child = false
  let quote = ''
  let bracket = false
  const end = () => {
    if (!word) return
    if (parts.length) joins.push(child)
    else if (child) throw unsupported(selector)
    parts.push(word)
    word = ''
    child = false
  }
  for (const c of selector.trim()) {
    if (quote) quote = c === quote ? '' : quote
    else if (bracket && (c === '"' || c === "'")) quote = c
    else if (c === '[') bracket = true
    else if (c === ']') bracket = false
    else if (!bracket && /\s/.test(c)) {
      end()
      continue
    } else if (!bracket && c === '>') {
      end()
      if (child) throw unsupported(selector)
      child = true
      continue
    }
    word += c
  }
  end()
  if (!parts.length || child || quote || bracket) throw unsupported(selector)
  return parts.map((p, i) => ({ compound: compoundOf(p, selector), child: i > 0 && joins[i - 1]! }))
}

const matches = (actual: string, op: AttrOp, value: string): boolean =>
  op === '='
    ? actual === value
    : op === '~='
      ? value !== '' && !/\s/.test(value) && actual.split(/\s+/).includes(value)
      : value !== '' &&
        (op === '^='
          ? actual.startsWith(value)
          : op === '$='
            ? actual.endsWith(value)
            : actual.includes(value))

interface Opened {
  tag: string
  attrs: Record<string, string>
  parent: Opened | null
}

const fits = (node: Opened, c: Compound) =>
  (!c.tag || c.tag === node.tag) &&
  (!c.id || node.attrs.id === c.id) &&
  c.attrs.every(
    (a) => a.name in node.attrs && (a.value === undefined || matches(node.attrs[a.name]!, a.op, a.value)),
  )

const chainFits = (node: Opened, steps: Step[], last: number): boolean => {
  if (!fits(node, steps[last]!.compound)) return false
  if (last === 0) return true
  if (steps[last]!.child) return node.parent !== null && chainFits(node.parent, steps, last - 1)
  for (let up = node.parent; up; up = up.parent) if (chainFits(up, steps, last - 1)) return true
  return false
}

const closed = (open: Opened | null, tag: string): Opened | null => {
  for (let up = open; up; up = up.parent) if (up.tag === tag) return up.parent
  return open
}

export function elementsOf(html: string, selector: string): RequestElement[] {
  if (selector.includes(','))
    return selector
      .split(',')
      .filter((part) => part.trim())
      .flatMap((part) => elementsOf(html, part.trim()))
  const steps = stepsOf(selector)
  const target = steps[steps.length - 1]!.compound
  const raw = target.tag === 'script' || target.tag === 'style'
  const hidden = /<(script|style|template)\b[\s\S]*?<\/\1>/gi
  const shape = html.replace(hidden, (m) => {
    const open = /^<[^>]*>/.exec(m)![0]
    const close = /<\/[^>]*>$/.exec(m)![0]
    return open + ' '.repeat(m.length - open.length - close.length) + close
  })
  const source = raw ? html : html.replace(hidden, (m) => ' '.repeat(m.length))
  const out: RequestElement[] = []
  let parent: Opened | null = null
  for (const m of shape.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)) {
    const tag = m[2]!.toLowerCase()
    if (m[1]) {
      parent = closed(parent, tag)
      continue
    }
    const node: Opened = { tag, attrs: attrsOf(m[3]!.replace(/\/$/, '')), parent }
    if (!VOID.has(tag) && !m[3]!.endsWith('/')) parent = node
    if ((!raw && HIDDEN.has(tag)) || !chainFits(node, steps, steps.length - 1)) continue
    let text = ''
    if (!VOID.has(tag)) {
      const start = m.index + m[0].length
      const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
      tags.lastIndex = start
      let depth = 1
      let end = source.length
      for (let t = tags.exec(source); t; t = tags.exec(source)) {
        depth += t[1] ? -1 : 1
        if (depth === 0) {
          end = t.index
          break
        }
      }
      text = raw ? source.slice(start, end).trim() : plain(source.slice(start, end))
    }
    const limit = raw ? 2000 : 120
    out.push({
      selector,
      tag,
      attrs: node.attrs,
      text: text.length > limit ? `${text.slice(0, limit)}…` : text,
    })
  }
  return out
}

const titleOf = (html: string) => {
  const t = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1]
  return t === undefined ? null : plain(t)
}

const alertsOf = (html: string) =>
  [...html.matchAll(/<(\w+)\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => plain(m[2]!))
    .filter((t) => t !== '')

export interface RequestOptions {
  paths: string[]
  select: string[]
  forms: boolean
  session: string | undefined
  full: boolean
}

export const parseSession = (json: string): unknown => {
  try {
    return JSON.parse(json)
  } catch {
    throw new HozuCliError('usage', '--session must be JSON', [`--session '{"userId":"ada"}'`])
  }
}

export async function appParts(loaded: Loaded, command: string, sessions: (string | undefined)[]) {
  const importFrom = importer(loaded, command)
  const build = loaded.build()
  const module = await requireApp(loaded, command, build)
  const values = sessions.map((json) => (json === undefined ? undefined : parseSession(json)))
  const { memorySessions } = await importFrom<{
    memorySessions(o: { secret: string; secure: boolean }): { issue(value: unknown): Promise<string> }
  }>('@hozu/runtime-server', ['npm install @hozu/runtime-server'])
  const store = values.some((v) => v !== undefined)
    ? memorySessions({ secret: randomBytes(24).toString('hex'), secure: false })
    : null
  const cookies = await Promise.all(
    values.map((v) => (store && v !== undefined ? store.issue(v) : Promise.resolve(null))),
  )
  return { importFrom, build, module, session: store, cookies }
}

const plainJson = (value: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? String(v) : v)))
  } catch {
    return String(value)
  }
}

export function serverErrorOf(error: unknown, info: unknown): ServerError {
  const { effect, path, ...rest } = (typeof info === 'object' && info !== null ? info : {}) as Record<
    string,
    unknown
  >
  const issues = error instanceof Error && 'issues' in error ? { issues: plainJson(error.issues) } : {}
  const details = { ...(plainJson(rest) as Record<string, unknown>), ...issues }
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(typeof effect === 'string' ? { effect } : {}),
    ...(typeof path === 'string' ? { path } : {}),
    ...(Object.keys(details).length ? { details } : {}),
  }
}

type OnError = (error: unknown, info: unknown) => void

export const collectingErrors = (
  options: Record<string, unknown>,
  push: (e: ServerError) => void,
): OnError => {
  const own = typeof options.onError === 'function' ? (options.onError as OnError) : null
  return (error, info) => {
    push(serverErrorOf(error, info))
    own?.(error, info)
  }
}

export const IN_PRODUCTION = '(a production server shows "Internal error" here; onError keeps the message)'

export const describeServerError = (e: ServerError) =>
  `${e.message}${e.effect ? ` (${e.effect})` : ''}${e.details ? ` ${JSON.stringify(e.details)}` : ''}`

export async function runRequest(loaded: Loaded, options: RequestOptions): Promise<RequestOutput> {
  if (!options.paths.length) throw new HozuCliError('usage', 'hozu get needs a path', ['hozu get /'])
  const parts = await appParts(loaded, 'get', [options.session])
  const { testApp } = await parts.importFrom<TestingModule>('@hozu/testing', ['npm install -D @hozu/testing'])
  const server = await parts.importFrom<{ app(options: unknown): unknown }>('@hozu/runtime-server')
  const serverErrors: ServerError[] = []
  const app = testApp(
    server.app({
      ...parts.module.options,
      onError: collectingErrors(parts.module.options, (e) => serverErrors.push(e)),
    }),
    {
      env: process.env,
      ...(parts.session ? { session: parts.session } : {}),
    },
  )
  const cookies = new Map<string, string>()
  const [cookie] = parts.cookies
  if (cookie) {
    const eq = cookie.indexOf('=')
    cookies.set(cookie.slice(0, eq), cookie.slice(eq + 1))
  }
  const init = (): RequestInit => ({
    headers: cookies.size ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {},
  })
  const remember = (page: TestPage) => {
    for (const c of page.headers.getSetCookie()) {
      const [pair = ''] = c.split(';')
      const eq = pair.indexOf('=')
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }
  const steps: RequestStep[] = []
  const record = (path: string, page: TestPage, final: boolean, since: number) => {
    const location = page.headers.get('location')
    const text = page.text.length > LIMIT && !options.full ? `${page.text.slice(0, LIMIT)}…` : page.text
    steps.push({
      method: 'GET',
      path,
      status: page.status,
      location,
      cookies: page.headers.getSetCookie().map((c) => c.replace(/^([^=]+)=[^;]*/, '$1=…')),
      title: final ? titleOf(page.html) : null,
      alerts: final ? alertsOf(page.html) : [],
      text: final ? text : null,
      truncated: final && page.text.length > LIMIT && !options.full,
      elements: final ? options.select.flatMap((q) => elementsOf(page.html, q)) : [],
      forms: final && options.forms ? formsOf(page.html, path) : [],
      serverErrors: serverErrors.slice(since),
    })
  }
  for (let path of options.paths)
    for (let hops = 0; hops < 5; hops++) {
      const since = serverErrors.length
      const page = await app.get(path, init())
      remember(page)
      const location = page.headers.get('location')
      const redirect = page.status >= 300 && page.status < 400 && location
      record(path, page, !redirect, since)
      if (!redirect) break
      const next = new URL(location, 'http://localhost/')
      path = next.pathname + next.search
    }
  return { steps }
}

const quoted = (v: string) => JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}…` : v)

export function describeForm(f: RequestForm): string {
  const via = (outside: boolean) => (outside ? ' (form=)' : '')
  const parts = [
    f.fields.length
      ? `fields: ${f.fields.map((x: RequestFormField) => `${x.name}=${quoted(x.value)}${via(x.outside)}`).join(' ')}`
      : 'fields: (none)',
    ...f.groups.map(
      (g: RequestFormGroup) =>
        `${g.type} ${g.name}${via(g.outside)}: ${g.options.map((o) => `${o.value}${o.checked ? ' ✓' : ''}`).join(', ')}`,
    ),
    `buttons: ${
      f.buttons
        .map(
          (b: RequestFormButton) =>
            `${b.text || '(no text)'}${b.name ? ` (${b.name}=${b.value})` : ''}${via(b.outside)}`,
        )
        .join(', ') || '(none)'
    }`,
  ]
  return `form ${f.method.toUpperCase()} ${f.action}${f.id ? ` #${f.id}` : ''}${f.label ? ` "${f.label}"` : ''} ${parts.join(' · ')}`
}

export function describeRequest(out: RequestOutput): string {
  const lines: string[] = []
  let noted = false
  for (const s of out.steps) {
    lines.push(`${s.method} ${s.path} → ${s.status}${s.location ? ` ${s.location}` : ''}`)
    for (const c of s.cookies) lines.push(`  set-cookie: ${c}`)
    for (const text of new Set(s.serverErrors.map(describeServerError))) lines.push(`  server error: ${text}`)
    if (s.serverErrors.length && !noted) {
      noted = true
      lines.push(`  ${IN_PRODUCTION}`)
    }
    if (s.text === null) continue
    if (s.title) lines.push(`  title: ${s.title}`)
    for (const a of s.alerts) lines.push(`  alert: ${a}`)
    lines.push(`  text: ${s.text}${s.truncated ? ' (truncated; --full shows all)' : ''}`)
    for (const e of s.elements) lines.push(`  ${describeElement(e)}`)
    for (const f of s.forms) lines.push(`  ${describeForm(f)}`)
  }
  return `${lines.join('\n')}\n`
}

const CLASS_WIDTH = 60

/** One selected element: its attributes, then its class last and cut (`--json` has it whole), then its text. */
export const describeElement = (e: RequestElement) => {
  const cls = e.attrs.class
  const shown =
    cls === undefined
      ? ''
      : cls.length > CLASS_WIDTH
        ? ` class="${cls.slice(0, CLASS_WIDTH)}…"`
        : ` class="${cls}"`
  return `${e.selector}: <${e.tag}${Object.entries(e.attrs)
    .filter(([k]) => k !== 'style' && k !== 'class')
    .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v}"`))
    .join('')}${shown}>${e.text ? ` ${e.text}` : ''}`
}
