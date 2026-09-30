import { randomBytes } from 'node:crypto'
import type {
  RequestElement,
  RequestForm,
  RequestFormButton,
  RequestFormField,
  RequestFormGroup,
  RequestOutput,
  RequestStep,
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

const selectorOf = (selector: string) => {
  const m = /^([a-z][\w-]*)?(?:#([\w-]+))?(?:\[([\w:-]+)(?:=["']?([^"'\]]*)["']?)?\])?$/i.exec(
    selector.trim(),
  )
  if (!m || (!m[1] && !m[2] && !m[3]))
    throw new HozuCliError('usage', `Unsupported selector "${selector}"`, [
      'button',
      '#id',
      '[role=alert]',
      'a[href]',
      'input[name=title]',
    ])
  return { tag: m[1]?.toLowerCase(), id: m[2], attr: m[3]?.toLowerCase(), value: m[4] }
}

export function elementsOf(html: string, selector: string): RequestElement[] {
  if (selector.includes(','))
    return selector
      .split(',')
      .filter((part) => part.trim())
      .flatMap((part) => elementsOf(html, part.trim()))
  const sel = selectorOf(selector)
  const source = html.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, (m) => ' '.repeat(m.length))
  const out: RequestElement[] = []
  const open = /<([a-z][\w-]*)\b([^>]*)>/gi
  for (const m of source.matchAll(open)) {
    const tag = m[1]!.toLowerCase()
    if (sel.tag && sel.tag !== tag) continue
    const attrs = attrsOf(m[2]!.replace(/\/$/, ''))
    if (sel.id && attrs.id !== sel.id) continue
    if (sel.attr && (!(sel.attr in attrs) || (sel.value !== undefined && attrs[sel.attr] !== sel.value)))
      continue
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
      text = plain(source.slice(start, end))
    }
    out.push({ selector, tag, attrs, text: text.length > 120 ? `${text.slice(0, 120)}…` : text })
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

export async function runRequest(loaded: Loaded, options: RequestOptions): Promise<RequestOutput> {
  if (!options.paths.length) throw new HozuCliError('usage', 'hozu get needs a path', ['hozu get /'])
  const parts = await appParts(loaded, 'get', [options.session])
  const { testApp } = await parts.importFrom<TestingModule>('@hozu/testing', ['npm install -D @hozu/testing'])
  const app = testApp(parts.module.app, {
    env: process.env,
    ...(parts.session ? { session: parts.session } : {}),
  })
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
  const record = (path: string, page: TestPage, final: boolean) => {
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
    })
  }
  for (let path of options.paths)
    for (let hops = 0; hops < 5; hops++) {
      const page = await app.get(path, init())
      remember(page)
      const location = page.headers.get('location')
      const redirect = page.status >= 300 && page.status < 400 && location
      record(path, page, !redirect)
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
  for (const s of out.steps) {
    lines.push(`${s.method} ${s.path} → ${s.status}${s.location ? ` ${s.location}` : ''}`)
    for (const c of s.cookies) lines.push(`  set-cookie: ${c}`)
    if (s.text === null) continue
    if (s.title) lines.push(`  title: ${s.title}`)
    for (const a of s.alerts) lines.push(`  alert: ${a}`)
    lines.push(`  text: ${s.text}${s.truncated ? ' (truncated; --full shows all)' : ''}`)
    for (const e of s.elements) lines.push(`  ${describeElement(e)}`)
    for (const f of s.forms) lines.push(`  ${describeForm(f)}`)
  }
  return `${lines.join('\n')}\n`
}

export const describeElement = (e: RequestElement) =>
  `${e.selector}: <${e.tag}${Object.entries(e.attrs)
    .filter(([k]) => k !== 'class' && k !== 'style')
    .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v}"`))
    .join('')}>${e.text ? ` ${e.text}` : ''}`
