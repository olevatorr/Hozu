import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { RequestElement, RequestOutput, RequestStep } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'

interface TestPage {
  status: number
  headers: Headers
  html: string
  text: string
}

interface TestApp {
  get(path: string, init?: RequestInit): Promise<TestPage>
  post(path: string, form: Record<string, string>, init?: RequestInit): Promise<TestPage>
}

type TestingModule = { testApp(options: Record<string, unknown>): TestApp }

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

interface Form {
  action: string
  fields: Record<string, string>
  buttons: string[]
}

export function formsOf(html: string, at: string): Form[] {
  const forms: Form[] = []
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)) {
    const attrs = attrsOf(m[1]!)
    if ((attrs.method ?? 'get').toLowerCase() !== 'post') continue
    const body = m[2]!
    const fields: Record<string, string> = {}
    for (const i of body.matchAll(/<input\b([^>]*)>/g)) {
      const a = attrsOf(i[1]!)
      if (!a.name || ['submit', 'button', 'reset', 'file'].includes(a.type ?? '')) continue
      if (['checkbox', 'radio'].includes(a.type ?? '') && !('checked' in a)) continue
      fields[a.name] = a.value ?? (a.type === 'checkbox' ? 'on' : '')
    }
    for (const s of body.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      const name = attrsOf(s[1]!).name
      if (!name) continue
      const options = [...s[2]!.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((o) => {
        const a = attrsOf(o[1]!)
        return { value: a.value ?? plain(o[2]!), selected: 'selected' in a }
      })
      const chosen = options.find((o) => o.selected) ?? options[0]
      if (chosen) fields[name] = chosen.value
    }
    for (const t of body.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
      const name = attrsOf(t[1]!).name
      if (name) fields[name] = decode(t[2]!)
    }
    const buttons: string[] = []
    for (const b of body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g))
      if ((attrsOf(b[1]!).type ?? 'submit') === 'submit') buttons.push(plain(b[2]!))
    for (const i of body.matchAll(/<input\b([^>]*)>/g)) {
      const a = attrsOf(i[1]!)
      if (a.type === 'submit') buttons.push(a.value ?? 'Submit')
    }
    forms.push({ action: attrs.action || at, fields, buttons })
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
  method: 'GET' | 'POST'
  paths: string[]
  fields: string[]
  next: string[]
  button: string | undefined
  select: string[]
  forms: boolean
  session: string | undefined
  full: boolean
}

export async function runRequest(loaded: Loaded, options: RequestOptions): Promise<RequestOutput> {
  const require = createRequire(loaded.path)
  const importFrom = async <T>(id: string, hint: string[]): Promise<T> => {
    try {
      return (await import(pathToFileURL(require.resolve(id)).href)) as T
    } catch {
      throw new HozuCliError('config', `hozu ${options.method.toLowerCase()} needs ${id} in the app`, hint)
    }
  }
  const { testApp } = await importFrom<TestingModule>('@hozu/testing', ['npm install -D @hozu/testing'])
  const serverPath = join(dirname(loaded.path), 'server.ts')
  const server = await import(pathToFileURL(serverPath).href).catch(() => null)
  if (typeof server?.createResolvers !== 'function')
    throw new HozuCliError('config', `${serverPath} must export createResolvers()`, [
      'export function createResolvers() { return resolvers(project, (implement) => [...]) }',
    ])
  let session: unknown = null
  if (options.session !== undefined)
    try {
      session = JSON.parse(options.session)
    } catch {
      throw new HozuCliError('usage', '--session must be JSON', [`--session '{"userId":"ada"}'`])
    }
  const app = testApp({
    build: loaded.build(),
    resolvers: server.createResolvers(),
    env: process.env,
    session: () => session,
  })
  const cookies = new Map<string, string>()
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
  const record = (method: 'GET' | 'POST', path: string, page: TestPage, final: boolean) => {
    const location = page.headers.get('location')
    const text = page.text.length > LIMIT && !options.full ? `${page.text.slice(0, LIMIT)}…` : page.text
    steps.push({
      method,
      path,
      status: page.status,
      location,
      title: final ? titleOf(page.html) : null,
      alerts: final ? alertsOf(page.html) : [],
      text: final ? text : null,
      truncated: final && page.text.length > LIMIT && !options.full,
      elements: final ? options.select.flatMap((q) => elementsOf(page.html, q)) : [],
      forms: final && options.forms ? formsOf(page.html, path) : [],
    })
  }
  const get = async (path: string): Promise<void> => {
    for (let hops = 0; hops < 5; hops++) {
      const page = await app.get(path, init())
      remember(page)
      const location = page.headers.get('location')
      const redirect = page.status >= 300 && page.status < 400 && location
      record('GET', path, page, !redirect)
      if (!redirect) return
      path = new URL(location, 'http://localhost/').pathname + new URL(location, 'http://localhost/').search
    }
  }
  if (options.method === 'GET') {
    if (!options.paths.length) throw new HozuCliError('usage', 'hozu get needs a path', ['hozu get /'])
    for (const path of options.paths) await get(path)
    return { steps }
  }
  const fieldsOf = (list: string[]) => {
    const given: Record<string, string> = {}
    for (const f of list) {
      const eq = f.indexOf('=')
      if (eq <= 0)
        throw new HozuCliError('usage', `Field "${f}" must be name=value`, ['--field title=Ship it'])
      given[f.slice(0, eq)] = f.slice(eq + 1)
    }
    return given
  }
  const post = async (path: string, given: Record<string, string>, button: string | undefined) => {
    const page = await app.get(path, init())
    remember(page)
    const forms = formsOf(page.html, path)
    const label = button?.trim().toLowerCase()
    const form = forms.find(
      (f) =>
        Object.keys(given).every((k) => k in f.fields) &&
        (label === undefined || f.buttons.some((b) => b.toLowerCase() === label)),
    )
    if (!form)
      throw new HozuCliError(
        'usage',
        forms.length
          ? `No form on ${path} has ${[
              Object.keys(given).length ? `the fields ${Object.keys(given).join(', ')}` : '',
              label ? `a "${button}" button` : '',
            ]
              .filter(Boolean)
              .join(' and ')}`
          : `${path} has no form that posts`,
        forms.map(
          (f) =>
            `form fields: ${Object.keys(f.fields).join(', ') || '(none)'} · buttons: ${f.buttons.join(', ') || '(none)'}`,
        ),
      )
    const posted = await app.post(form.action, { ...form.fields, ...given }, init())
    remember(posted)
    const location = posted.headers.get('location')
    const redirect = posted.status >= 300 && posted.status < 400 && location
    record('POST', path, posted, !redirect)
    if (redirect) {
      const next = new URL(location, 'http://localhost/')
      await get(next.pathname + next.search)
    }
  }
  const [path] = options.paths
  if (!path) throw new HozuCliError('usage', 'hozu post needs a path', ['hozu post / --field title=Ship'])
  await post(path, fieldsOf(options.fields), options.button)
  for (const next of options.next) {
    const m = /^(GET|POST)\s+(\S+)\s*(.*)$/.exec(next.trim())
    if (!m) await get(next.trim())
    else if (m[1] === 'GET') await get(m[2]!)
    else {
      const rest = m[3]!.trim()
      const [fields, button] = rest.startsWith('@')
        ? ['', rest.slice(1)]
        : (rest.split('@') as [string, string?])
      await post(m[2]!, fieldsOf(fields.trim() ? fields.trim().split('&') : []), button?.trim())
    }
  }
  return { steps }
}

export function describeRequest(out: RequestOutput): string {
  const lines: string[] = []
  for (const s of out.steps) {
    lines.push(`${s.method} ${s.path} → ${s.status}${s.location ? ` ${s.location}` : ''}`)
    if (s.text === null) continue
    if (s.title) lines.push(`  title: ${s.title}`)
    for (const a of s.alerts) lines.push(`  alert: ${a}`)
    lines.push(`  text: ${s.text}${s.truncated ? ' (truncated; --full shows all)' : ''}`)
    for (const e of s.elements)
      lines.push(
        `  ${e.selector}: <${e.tag}${Object.entries(e.attrs)
          .filter(([k]) => k !== 'class')
          .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v}"`))
          .join('')}>${e.text ? ` ${e.text}` : ''}`,
      )
    for (const f of s.forms)
      lines.push(
        `  form ${f.action} fields: ${
          Object.entries(f.fields)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(' ') || '(none)'
        } buttons: ${f.buttons.join(', ') || '(none)'}`,
      )
  }
  return `${lines.join('\n')}\n`
}
