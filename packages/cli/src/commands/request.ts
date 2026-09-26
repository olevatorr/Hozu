import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { RequestOutput, RequestStep } from '../contract.ts'
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
    forms.push({ action: attrs.action || at, fields })
  }
  return forms
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
  const post = async (path: string, given: Record<string, string>) => {
    const page = await app.get(path, init())
    remember(page)
    const forms = formsOf(page.html, path)
    const form = forms.find((f) => Object.keys(given).every((k) => k in f.fields))
    if (!form)
      throw new HozuCliError(
        'usage',
        forms.length
          ? `No form on ${path} has the fields ${Object.keys(given).join(', ')}`
          : `${path} has no form that posts`,
        forms.map((f) => `form fields: ${Object.keys(f.fields).join(', ') || '(none)'}`),
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
  await post(path, fieldsOf(options.fields))
  for (const next of options.next) {
    const m = /^(GET|POST)\s+(\S+)\s*(.*)$/.exec(next.trim())
    if (!m) await get(next.trim())
    else if (m[1] === 'GET') await get(m[2]!)
    else await post(m[2]!, fieldsOf(m[3] ? m[3].split('&') : []))
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
  }
  return `${lines.join('\n')}\n`
}
