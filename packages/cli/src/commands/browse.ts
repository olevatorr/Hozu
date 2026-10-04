import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { routePattern } from '@hozu/core/ir'
import { type Cdp, findBrowser, launch } from '../cdp.ts'
import type {
  BrowseActor,
  BrowseChange,
  BrowseComponent,
  BrowseElsewhere,
  BrowseError,
  BrowseMode,
  BrowseOutput,
  BrowseStep,
  RequestElement,
} from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { type Snapshot, type StepResult, sleep, Tab, World } from './browse-tab.ts'
import { describeElement, parseSession } from './request.ts'

const LIMIT = 1500

export type BrowseJs = 'on' | 'off' | 'both'

export type BrowsePlan = ({ open: number } | { actor: number; step: string })[]

export interface BrowseOptions {
  path: string | undefined
  actors: { name: string | null; session: string | undefined }[]
  plan: BrowsePlan
  js: BrowseJs
  select: string[]
  screenshot: string | undefined
  reducedMotion: boolean
  full: boolean
}

const TARGETED = new Set(['fill', 'select', 'check', 'uncheck', 'click', 'submit'])
const VERBS =
  'fill <label>=<value>, select <label>=<option>, check <label>, uncheck <label>, click <name>, submit "<form>", press <key>, wait <ms>, goto <path> (targets take in "<text>")'

interface Parsed {
  verb: string
  target: string
  value: string
  within: string | null
}

/** `click "Save draft"` names the same target as `click Save draft`. */
const unquote = (s: string) => s.replace(/^"(.*)"$/, '$1')

export function parseStep(text: string): Parsed {
  const space = text.indexOf(' ')
  const verb = space < 0 ? text : text.slice(0, space)
  let rest = space < 0 ? '' : text.slice(space + 1).trim()
  let within: string | null = null
  const scoped = TARGETED.has(verb) ? /^(.*?)\s+in\s+"([^"]+)"$/.exec(rest) : null
  if (scoped) {
    rest = scoped[1]!.trim()
    within = scoped[2]!
  }
  if (verb === 'fill' || verb === 'select') {
    const eq = rest.indexOf('=')
    if (eq <= 0) throw new Error(`"${text}" needs <label>=<value>`)
    return { verb, target: unquote(rest.slice(0, eq).trim()), value: rest.slice(eq + 1), within }
  }
  return { verb, target: unquote(rest), value: '', within }
}

const q = JSON.stringify

async function aim(tab: Tab, call: string) {
  const start = Date.now()
  for (;;) {
    const at = await tab.page(call)
    if (at.error || !at.covered) return at
    if (Date.now() - start > 1500)
      return { error: `${at.covered} covers the target where it would be clicked` }
    await sleep(50)
  }
}

export async function act(tab: Tab, p: Parsed): Promise<StepResult> {
  const off = tab.mode === 'off'
  const done = (r: { error?: string; note?: string | null }): StepResult => ({
    ok: !r.error,
    note: r.error ?? r.note ?? null,
    jsOnly: null,
  })
  if (p.verb === 'fill' || p.verb === 'select')
    return done(await tab.page(`${p.verb}(${q(p.target)}, ${q(p.value)}, ${q(p.within)})`))
  if (p.verb === 'submit') return done(await tab.page(`submit(${q(p.target)}, ${q(p.within)})`))
  if (p.verb === 'check' || p.verb === 'uncheck') {
    const at = await aim(tab, `checkable(${q(p.target)}, ${q(p.within)})`)
    if (at.error) return done(at)
    const want = p.verb === 'check'
    if (at.radio && !want) return done({ error: 'A radio button cannot be unchecked: check another option' })
    if (at.checked === want) return done({ note: `already ${p.verb}ed` })
    await tab.mouse(at.x, at.y)
    return done(at)
  }
  if (p.verb === 'click') {
    const at = await aim(tab, `point(${q(p.target)}, ${q(p.within)})`)
    if (at.error) return done(at)
    if (off && at.jsOnly) return { ok: true, note: at.note, jsOnly: at.jsOnly }
    await tab.mouse(at.x, at.y)
    return done(at)
  }
  if (p.verb === 'press') {
    if (!p.target) throw new Error('press takes a key such as Enter')
    const reason: string | null = off ? await tab.page(`keyJsOnly(${q(p.target)})`) : null
    if (reason) return { ok: true, note: null, jsOnly: reason }
    await tab.key(p.target)
    return done({})
  }
  if (p.verb === 'wait') {
    const ms = Number(p.target)
    if (!p.target || !Number.isFinite(ms) || ms < 0 || ms > 30000)
      throw new Error('wait takes milliseconds (0–30000)')
    await sleep(ms)
    return done({})
  }
  if (p.verb === 'goto') {
    if (!p.target.startsWith('/')) throw new Error('goto takes a path such as /items/1')
    await tab.open(p.target)
    return done({})
  }
  throw new Error(`Unknown step "${p.verb}": use ${VERBS}`)
}

const linesOf = (s: Snapshot) => s.text.split('\n').filter((l) => l.trim())

const minus = (a: string[], b: string[]) => {
  const left = new Map<string, number>()
  for (const l of b) left.set(l, (left.get(l) ?? 0) + 1)
  return a.filter((l) => {
    const n = left.get(l) ?? 0
    if (n > 0) left.set(l, n - 1)
    return n === 0
  })
}

const comparable = (s: Snapshot) => minus(linesOf(s), s.component)

/** Two modes are on the same page when the URLs match one route, whatever its params (ADR 0056 A15). */
export const routeKey = (patterns: RegExp[]) => (url: string) => {
  const { pathname, search } = new URL(url, 'http://localhost')
  const i = patterns.findIndex((p) => p.test(pathname))
  return i < 0 ? url : `${i}${search}`
}

const same = (a: Snapshot, b: Snapshot, key: (url: string) => string = (u) => u) => {
  const x = comparable(a)
  const y = comparable(b)
  return key(a.url) === key(b.url) && x.length === y.length && minus(x, y).length === 0
}

const delta = (before: Snapshot, after: Snapshot) =>
  before.url !== after.url
    ? { added: linesOf(after), removed: [] }
    : { added: minus(linesOf(after), linesOf(before)), removed: minus(linesOf(before), linesOf(after)) }

const combine = (changes: BrowseChange[]) => {
  const notes = changes.map((c) => c.note)
  if (notes.every((n) => n === notes[0])) return notes[0] ?? null
  return (
    changes
      .filter((c) => c.note)
      .map((c) => `${c.mode}: ${c.note}`)
      .join('; ') || null
  )
}

export async function runBrowse(loaded: Loaded, options: BrowseOptions): Promise<BrowseOutput> {
  const path = options.path ?? '/'
  if (!path.startsWith('/')) throw new HozuCliError('usage', 'hozu browse needs a path', ['hozu browse /'])
  for (const a of options.actors) if (a.session !== undefined) parseSession(a.session)
  const browser = findBrowser()
  if (!browser)
    throw new HozuCliError('config', 'hozu browse needs Chrome, Chromium or Edge, and none was found', [
      'Install Google Chrome, or set HOZU_CHROME=/path/to/chrome',
      'hozu get <path> reads pages without a browser',
    ])
  const modes: BrowseMode[] = options.js === 'both' ? ['on', 'off'] : [options.js]
  const sessions = options.actors.map((a) => a.session)
  const worlds = modes.map(() => new World(loaded.path, dirname(loaded.path), sessions))
  const pageKey = routeKey(Object.values(loaded.build().ir.routes).map((r) => routePattern(r.path).pattern))
  const profile = await mkdtemp(join(tmpdir(), 'hozu-browse-'))
  let cdp: Cdp | null = null
  const errors: BrowseError[] = []
  const tabs: Tab[] = []
  try {
    const cookies = await Promise.all(worlds.map((w) => w.cookies))
    cdp = launch(browser, profile)
    const bySession = new Map<string, Tab>()
    cdp.on((method, params, from) => {
      const tab = from ? bySession.get(from) : undefined
      if (!tab) return
      tab.handle(method, params, from!)
      if (method === 'Target.attachedToTarget') bySession.set(params.sessionId, tab)
    })
    const tabOf = (mode: BrowseMode, actor: number) =>
      tabs.find((t) => t.mode === mode && t.actor === options.actors[actor]!.name)!
    const nameOf = (actor: number) => options.actors[actor]!.name
    const steps: BrowseStep[] = []
    const initial = new Map<Tab, number>()
    let failed = false
    let opened = 0
    for (const item of options.plan) {
      if ('open' in item) {
        await Promise.all(
          modes.map(async (mode, m) => {
            const tab = new Tab(cdp!, worlds[m]!, mode, nameOf(item.open), errors)
            tabs.push(tab)
            await tab.start(cookies[m]![item.open] ?? null, options.reducedMotion)
            bySession.set(tab.sessionId, tab)
            await tab.open(path)
            initial.set(tab, tab.status)
            await tab.look()
          }),
        )
        if (opened++ > 0) {
          const changes = modes.map((mode): BrowseChange => {
            const tab = tabOf(mode, item.open)
            return {
              mode,
              ok: true,
              note: null,
              jsOnly: null,
              requested: true,
              navigated: true,
              url: tab.snapshot.url,
              added: linesOf(tab.snapshot),
              removed: [],
            }
          })
          steps.push({
            step: `open ${path}`,
            ok: true,
            note: null,
            actor: nameOf(item.open)!,
            modes: changes,
          })
        }
        continue
      }
      const actor = nameOf(item.actor)
      const text = item.step.trim()
      const base = { step: text, ...(actor === null ? {} : { actor }) }
      if (failed) {
        steps.push({ ...base, ok: false, note: 'skipped after a failed step' })
        continue
      }
      const results = await Promise.all(
        modes.map(async (mode) => {
          const tab = tabOf(mode, item.actor)
          const others = tabs.filter((t) => t.mode === mode && t !== tab)
          const before = tab.snapshot
          tab.requested = false
          tab.mark()
          for (const o of others) o.mark()
          let r: StepResult
          let verb = ''
          try {
            const parsed = parseStep(text)
            verb = parsed.verb
            r = await act(tab, parsed)
          } catch (error) {
            r = { ok: false, note: error instanceof Error ? error.message : String(error), jsOnly: null }
          }
          const acted = r.ok && !r.jsOnly && verb !== 'wait' && verb !== 'goto'
          if (acted) await tab.settle()
          await Promise.all(others.map((o) => o.settle()))
          const after = await tab.look()
          const elsewhere: BrowseElsewhere[] = []
          for (const o of others) {
            const was = o.snapshot
            const d = delta(was, await o.look())
            if (d.added.length || d.removed.length) elsewhere.push({ actor: o.actor ?? '', mode, ...d })
          }
          const change: BrowseChange = {
            mode,
            ok: r.ok,
            note: r.note,
            jsOnly: r.jsOnly,
            requested: tab.requested,
            navigated: before.url !== after.url,
            url: after.url,
            ...delta(before, after),
          }
          return { change, before, after, elsewhere }
        }),
      )
      const changes = results.map((x) => x.change)
      const [on, off] = results
      const differs =
        on !== undefined &&
        off !== undefined &&
        same(on.before, off.before, pageKey) &&
        on.change.requested &&
        off.change.requested &&
        !same(on.after, off.after, pageKey)
      const elsewhere = results.flatMap((x) => x.elsewhere)
      const ok = changes.every((c) => c.ok)
      steps.push({
        ...base,
        ok,
        note: combine(changes),
        modes: changes,
        ...(differs ? { differs } : {}),
        ...(elsewhere.length ? { elsewhere } : {}),
      })
      if (!ok) failed = true
    }

    const order = (e: BrowseError) =>
      options.actors.findIndex((a) => a.name === (e.actor ?? null)) * 2 + modes.indexOf(e.mode ?? modes[0]!)
    errors.sort((a, b) => order(a) - order(b))
    const first = tabs.find((t) => t.actor === options.actors[0]!.name)!
    const on = tabs.find((t) => t.actor === first.actor && t.mode === 'on')
    const expected = on
      ? Object.entries(
          (await on.evaluate(
            "(() => { try { return JSON.parse(document.getElementById('hozu-payload')?.textContent ?? '{}').components ?? {} } catch { return {} } })()",
          )) as Record<string, { load: string }>,
        ).map(([name, c]) => [name, c.load])
      : []
    const report = on
      ? await on.page(`report(${q(options.select)}, ${q(expected)})`)
      : { hydrated: false, components: [], ...(await first.page(`report(${q(options.select)}, [])`)) }
    let screenshot: string | null = null
    if (options.screenshot) {
      const shot = await first.send('Page.captureScreenshot', { format: 'png' })
      const file = resolve(options.screenshot)
      await writeFile(file, Buffer.from(shot.data, 'base64'))
      const near = relative(process.cwd(), file)
      screenshot = near && !near.startsWith('..') ? near : file
    }
    const clip = (text: string) => (text.length > LIMIT && !options.full ? `${text.slice(0, LIMIT)}…` : text)
    const full = first.snapshot.text
    const output: BrowseOutput = {
      path,
      url: first.snapshot.url,
      status: initial.get(first) ?? first.status,
      title: first.snapshot.title,
      hydrated: on ? report.hydrated : false,
      steps,
      errors,
      components: (on ? report.components : []) as BrowseComponent[],
      text: clip(full),
      truncated: full.length > LIMIT && !options.full,
      elements: (on ? report.elements : report.elements) as RequestElement[],
      screenshot,
      modes,
    }
    if (tabs.length > 1)
      output.actors = tabs.map(
        (t): BrowseActor => ({
          name: t.actor ?? '',
          mode: t.mode,
          url: t.snapshot.url,
          status: initial.get(t) ?? t.status,
          title: t.snapshot.title,
          steps: steps.filter((s) => (s.actor ?? null) === t.actor),
          errors: errors.filter((e) => (e.actor ?? null) === t.actor && e.mode === t.mode),
          text: clip(t.snapshot.text),
        }),
      )
    return output
  } finally {
    await cdp?.close().catch(() => {})
    await Promise.all(worlds.map((w) => w.close().catch(() => 0)))
    await rm(profile, { recursive: true, force: true }).catch(() => {})
  }
}

export const browseFailed = (out: BrowseOutput) =>
  out.errors.length > 0 ||
  out.steps.some((s) => !s.ok || s.differs) ||
  out.components.some((c) => c.state === 'failed')

const ITEMS = 6
const WIDTH = 60
const TEXT = 600

const cut = (s: string, n: number, full: boolean) => (!full && s.length > n ? `${s.slice(0, n)}…` : s)

function describeChange(c: BrowseChange, full: boolean): string {
  if (!c.ok) return `FAILED — ${c.note}`
  if (c.jsOnly) return `js-only (${c.jsOnly})`
  const moved = c.navigated
  const items = [
    ...c.added.map((l) => (moved ? cut(l, WIDTH, full) : `+ ${cut(l, WIDTH, full)}`)),
    ...c.removed.map((l) => `− ${cut(l, WIDTH, full)}`),
  ]
  const shown = full ? items : items.slice(0, ITEMS)
  const more = items.length - shown.length
  const list = [...shown, ...(more ? [`… ${more} more`] : [])].join(' · ')
  return [moved ? `→ ${c.url}` : '', list].filter(Boolean).join(': ')
}

export function describeBrowse(out: BrowseOutput, full = false): string {
  const modes = out.modes ?? ['on']
  const lines = [
    `BROWSE ${out.path} → ${out.status}${out.url !== out.path ? ` (now ${out.url})` : ''} · ${
      modes.includes('on') ? (out.hydrated ? 'hydrated' : 'not hydrated') : 'no JS'
    } · js ${modes.join('+')}`,
    `  title: ${out.title}`,
  ]
  out.steps.forEach((s, i) => {
    const who = s.actor ? `${s.actor}: ` : ''
    const head = `  ${i + 1} ${who}${s.step}`
    const changes = s.modes ?? []
    const texts = changes.map((c) => describeChange(c, full))
    const flag = s.differs ? '  ≠ DIFFERS: both modes made a request and the resulting text differs' : ''
    if (!changes.length) lines.push(`${head}${s.note ? ` — ${s.note}` : ''}`)
    else if (texts.every((t) => t === texts[0]))
      lines.push(`${head}${texts[0] ? `: ${texts[0]}` : ''}${s.ok && s.note ? ` — ${s.note}` : ''}${flag}`)
    else {
      lines.push(`${head}${flag}`)
      changes.forEach((c, k) => {
        lines.push(`      ${c.mode}: ${texts[k] || '(no change)'}${c.ok && c.note ? ` — ${c.note}` : ''}`)
      })
    }
    for (const e of s.elsewhere ?? [])
      lines.push(
        `      ${e.actor || 'page'}${modes.length > 1 ? ` (${e.mode})` : ''}: ${describeChange(
          {
            mode: e.mode,
            ok: true,
            note: null,
            jsOnly: null,
            requested: false,
            navigated: false,
            url: '',
            added: e.added,
            removed: e.removed,
          },
          full,
        )}`,
      )
  })
  if (!out.errors.length) lines.push('  errors: none')
  for (const e of out.errors)
    lines.push(
      `  error (${[e.kind, e.type, e.actor, modes.length > 1 ? e.mode : undefined].filter(Boolean).join(', ')}): ${e.text}${
        e.at ? ` at ${e.at}` : ''
      }${e.url && e.url !== e.at ? ` on ${e.url}` : ''}`,
    )
  for (const c of out.components)
    lines.push(
      `  component ${c.name}: ${c.state}${c.width === null ? '' : ` ${c.width}×${c.height}`}${
        c.state === 'mounted' ? `, ${c.canvases} canvas, ${c.elements} elements` : ''
      }${c.hint ? ` — ${c.hint}` : ''}`,
    )
  const text = out.text.replace(/\n/g, ' · ')
  lines.push(
    `  text: ${cut(text, TEXT, full)}${out.truncated || (!full && text.length > TEXT) ? ' (truncated; --full shows all)' : ''}`,
  )
  const firstName = out.actors?.[0]?.name
  for (const a of out.actors ?? [])
    if (a.name !== firstName && a.mode === modes[0])
      lines.push(`  ${a.name}: ${a.url} · ${cut(a.text.replace(/\n/g, ' · '), 200, full)}`)
  for (const e of out.elements) lines.push(`  ${describeElement(e)}`)
  if (out.screenshot) lines.push(`  screenshot: ${out.screenshot}`)
  return `${lines.join('\n')}\n`
}
