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
import { describeElement, describeServerError, IN_PRODUCTION, parseSession } from './request.ts'

const LIMIT = 1500

export type BrowseJs = 'on' | 'off' | 'both'

export type BrowsePlan = ({ open: number } | { actor: number; step: string })[]

export interface BrowseOptions {
  path: string | undefined
  actors: { name: string | null; session: string | undefined; headers: string[] }[]
  plan: BrowsePlan
  js: BrowseJs
  select: string[]
  screenshot: string | undefined
  reducedMotion: boolean
  viewport: { width: number; height: number }
  full: boolean
  /** A folder `hozu build --target workers | vercel` wrote: requests go through its entry, not the source (ADR 0073 A3). */
  built?: string | undefined
}

const TARGETED = new Set(['fill', 'select', 'check', 'uncheck', 'click', 'submit'])
const VERBS =
  'fill <label>=<value>, select <label>=<option>, check <label>, uncheck <label>, click <name>, submit "<form>", press <key>, wait <ms>, goto <path>, post <path> <a=1&b=2>, remember <name> from url|<selector> [@attr], hold <feature>.<effect>, release (targets take in "<text>"; $name reads a remembered value)'

interface Parsed {
  verb: string
  target: string
  value: string
  within: string | null
}

/** `click "Save draft"` names the same target as `click Save draft`. */
const unquote = (s: string) => s.replace(/^"(.*)"$/, '$1')

const STEP =
  /^\s*(?:fill|select|check|uncheck|click|submit|press|wait|goto|post|remember|hold|release)(?:\s|;|$)/

/** `--do 'fill Title=Milk; press Enter'` is two steps: split where a verb and a space follow a semicolon outside quotes, so values may hold one. */
export const stepsOf = (text: string): string[] => {
  const steps: string[] = []
  let start = 0
  const balanced = (text.match(/"/g)?.length ?? 0) % 2 === 0
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"' && balanced) quoted = !quoted
    else if (text[i] === ';' && !quoted && STEP.test(text.slice(i + 1))) {
      steps.push(text.slice(start, i))
      start = i + 1
    }
  }
  steps.push(text.slice(start))
  return steps.map((step) => step.trim()).filter(Boolean)
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', '\\': '\\' }

export const unescapeValue = (value: string): string =>
  value.replace(/\\([nt\\])/g, (_, c: string) => ESCAPES[c]!)

const fillValue = (verb: string, value: string) => (verb === 'fill' ? unescapeValue(value) : value)

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
  if ((verb === 'fill' || verb === 'select') && within === null) {
    const before = /^("[^"]*"|[^="]*?)\s+in\s+"([^"]+)"\s*=(.*)$/.exec(rest)
    if (before)
      return {
        verb,
        target: unquote(before[1]!.trim()),
        value: fillValue(verb, before[3]!),
        within: before[2]!,
      }
  }
  if (verb === 'fill' || verb === 'select') {
    const eq = rest.indexOf('=', rest.startsWith('"') ? Math.max(rest.indexOf('"', 1), 0) : 0)
    if (eq <= 0) throw new Error(`"${text}" needs <label>=<value>`)
    return {
      verb,
      target: unquote(rest.slice(0, eq).trim()),
      value: fillValue(verb, rest.slice(eq + 1)),
      within,
    }
  }
  return { verb, target: verb === 'post' || verb === 'remember' ? rest : unquote(rest), value: '', within }
}

const q = JSON.stringify

async function aim(tab: Tab, call: string) {
  const start = Date.now()
  for (;;) {
    const at = await tab.page(call)
    if (at.error || !at.covered) return at
    if (Date.now() - start > 1500)
      return { error: `the click would land on ${at.covered}, above ${at.target}: a person cannot click it` }
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
  if (p.verb === 'hold') {
    if (!/^[\w-]+\.\w+$/.test(p.target))
      throw new Error('hold takes <feature>.<effect>, e.g. hold notes.addNote')
    if (off) return { ok: true, note: null, jsOnly: 'only a JS call to an effect can be held' }
    tab.held.add(p.target)
    await tab.holdInPage(p.target)
    return done({ note: `holding ${p.target}: its answer waits for release` })
  }
  if (p.verb === 'release') {
    if (off) return { ok: true, note: null, jsOnly: 'only a JS call to an effect can be held' }
    const n = await tab.release()
    return done({ note: n ? `released ${n} held answer${n === 1 ? '' : 's'}` : 'nothing was held' })
  }
  if (p.verb === 'press') {
    if (!p.target) throw new Error('press takes a key such as Enter')
    const reason: string | null = off ? await tab.page(`keyJsOnly(${q(p.target)})`) : null
    if (reason) return { ok: true, note: null, jsOnly: reason }
    const before = await tab.page('focused()').catch(() => null)
    await tab.key(p.target)
    const after = await tab.page('focused()').catch(() => null)
    return done({ note: after && after !== before ? `focused ${after}` : null })
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
  if (p.verb === 'post') {
    const space = p.target.indexOf(' ')
    const path = space < 0 ? p.target : p.target.slice(0, space)
    if (!path.startsWith('/'))
      throw new Error('post takes a path and form fields: post /items title=Milk&done=on')
    const fields = [...new URLSearchParams(space < 0 ? '' : p.target.slice(space + 1).trim())]
    tab.mark()
    await tab.evaluate(`(() => {
      const f = document.createElement('form')
      f.method = 'post'
      f.action = ${q(path)}
      for (const [name, value] of ${q(fields)}) {
        const i = document.createElement('input')
        i.type = 'hidden'
        i.name = name
        i.value = value
        f.append(i)
      }
      document.body.append(f)
      HTMLFormElement.prototype.submit.call(f)
      return true
    })()`)
    await tab.settle()
    return done({ note: `posted ${fields.length} field${fields.length === 1 ? '' : 's'} to ${path}` })
  }
  if (p.verb === 'screenshot')
    throw new Error(
      'There is no screenshot step: add --screenshot <file> to save a PNG after the steps (--viewport 390x844 for a phone)',
    )
  throw new Error(`Unknown step "${p.verb}": use ${VERBS}`)
}

/**
 * `remember <name> from url` keeps the page's path; `from <selector>` the first match's text, and
 * `from <selector> @<attr>` an attribute. Each mode keeps its own values, since each has its own data (ADR 0056 C).
 */
async function remember(tab: Tab, target: string, into: Map<string, string>): Promise<StepResult> {
  const m = /^([A-Za-z_]\w*)\s+from\s+(.+?)(?:\s+@([\w-]+))?$/.exec(target)
  if (!m) throw new Error('remember takes <name> from url, <selector> or <selector> @<attribute>')
  const [, name, from, attr] = m as unknown as [string, string, string, string | undefined]
  const value: string | null =
    from === 'url'
      ? await tab.evaluate('location.pathname + location.search')
      : await tab.evaluate(`(() => {
          const el = document.querySelector(${q(from)})
          return el ? ${attr ? `el.getAttribute(${q(attr)})` : 'el.textContent.trim()'} : null
        })()`)
  if (value === null || value === undefined)
    return { ok: false, note: `nothing matches ${from}${attr ? ` @${attr}` : ''}`, jsOnly: null }
  into.set(name, String(value))
  return { ok: true, note: `${name} = ${value}`, jsOnly: null }
}

export function headersOf(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of lines) {
    const at = line.indexOf(':')
    if (at <= 0) throw new HozuCliError('usage', `--header takes "Name: value", not "${line}"`, [])
    out[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
  }
  return out
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

const DIFFERENCES_SHOWN = 3

const shownWords = (words: string) => (words ? JSON.stringify(words) : '(nothing)')

const wordsOf = (line: string) => line.trim().split(/\s+/).filter(Boolean)

/** The words two lines share at the start and the end. */
const sharedEnds = (a: string[], b: string[]) => {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a.at(-1 - tail) === b.at(-1 - tail)) tail++
  return { head, tail }
}

/**
 * The words that differ between the two modes' pages (ADR 0070 B6): lines that share words at their ends are
 * paired first (`Order #1307 placed` / `Order #1306 placed` → `"#1307"` vs `"#1306"`), the rest in order.
 */
export const differences = (on: Snapshot, off: Snapshot, key: (url: string) => string = (u) => u) => {
  const x = minus(comparable(on), comparable(off)).map(wordsOf)
  const y = minus(comparable(off), comparable(on)).map(wordsOf)
  const pairs: [string[], string[]][] = []
  const left = new Set(y.keys())
  const lone: string[][] = []
  for (const a of x) {
    let best = -1
    let shared = 0
    for (const j of left) {
      const { head, tail } = sharedEnds(a, y[j]!)
      if (head + tail > shared) [best, shared] = [j, head + tail]
    }
    if (best < 0) lone.push(a)
    else {
      pairs.push([a, y[best]!])
      left.delete(best)
    }
  }
  const rest = [...left].map((j) => y[j]!)
  for (let i = 0; i < Math.max(lone.length, rest.length); i++) pairs.push([lone[i] ?? [], rest[i] ?? []])
  const out: { on: string; off: string }[] =
    key(on.url) === key(off.url) ? [] : [{ on: on.url, off: off.url }]
  for (const [a, b] of pairs.slice(0, DIFFERENCES_SHOWN - out.length)) {
    const { head, tail } = sharedEnds(a, b)
    out.push({ on: a.slice(head, a.length - tail).join(' '), off: b.slice(head, b.length - tail).join(' ') })
  }
  return out
}

const delta = (before: Snapshot, after: Snapshot, inPlace = false) =>
  before.url !== after.url && !inPlace
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
  const worlds = modes.map(
    () => new World(loaded.path, dirname(loaded.path), sessions, options.built ?? null),
  )
  const vars = new Map<BrowseMode, Map<string, string>>(modes.map((m) => [m, new Map()]))
  const inStep = modes.map(() => new Set<number>())
  const pageKey = routeKey(Object.values(loaded.build().ir.routes).map((r) => routePattern(r.path).pattern))
  const mutations = new Map<string, string>(
    Object.values(loaded.build().ir.features).flatMap((f) =>
      Object.entries(f.mutations).map(([name, m]) => [`${f.id}.${name}`, m.runs] as const),
    ),
  )
  const holdable = (target: string) => {
    const runs = mutations.get(target)
    if (runs === undefined) throw new Error(`hold: ${target} is not a mutation of this app`)
    return runs
  }
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
            tab.headers = headersOf(options.actors[item.open]!.headers)
            tabs.push(tab)
            await tab.start(cookies[m]![item.open] ?? null, options.reducedMotion, options.viewport)
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
        modes.map(async (mode, m) => {
          const tab = tabOf(mode, item.actor)
          const others = tabs.filter((t) => t.mode === mode && t !== tab)
          const before = tab.snapshot
          const serverSince = worlds[m]!.serverErrors.length
          tab.requested = false
          const loadsBefore = tab.documentLoads
          await tab.tagElements().catch(() => 0)
          tab.mark()
          for (const o of others) o.mark()
          let r: StepResult
          let verb = ''
          try {
            const own = vars.get(mode)!
            const parsed = parseStep(
              text.replace(/\$([A-Za-z_]\w*)/g, (_, name: string) => {
                const value = own.get(name)
                if (value === undefined) throw new Error(`$${name} was not remembered before this step`)
                return /^\s*fill\s/.test(text) ? value.replaceAll('\\', '\\\\') : value
              }),
            )
            verb = parsed.verb
            if (['fill', 'select', 'check', 'uncheck', 'click', 'submit', 'press'].includes(verb))
              await tab.markInput()
            if (verb === 'hold') holdable(parsed.target)
            r = parsed.verb === 'remember' ? await remember(tab, parsed.target, own) : await act(tab, parsed)
          } catch (error) {
            r = { ok: false, note: error instanceof Error ? error.message : String(error), jsOnly: null }
          }
          const acted =
            r.ok && !r.jsOnly && verb !== 'wait' && verb !== 'goto' && verb !== 'remember' && verb !== 'post'
          if (acted) await tab.settle()
          await Promise.all(others.map((o) => o.settle()))
          const after = await tab.look()
          const reloads = tab.documentLoads - loadsBefore
          const calm = reloads
            ? { replaced: 0, flashes: 0, flashed: [], shift: 0 }
            : await tab.smoothness().catch(() => ({ replaced: 0, flashes: 0, flashed: [], shift: 0 }))
          const { replaced, flashes, flashed, shift } = calm
          const arrived = reloads && before.url !== after.url ? await tab.arrival().catch(() => null) : null
          const serverErrors = worlds[m]!.serverErrors.slice(serverSince)
          for (let i = serverSince; i < serverSince + serverErrors.length; i++) inStep[m]!.add(i)
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
            document:
              reloads === 0
                ? 'in place'
                : before.url !== after.url || verb === 'goto' || verb === 'post'
                  ? 'navigated'
                  : 'reloaded',
            ...(replaced ? { replaced } : {}),
            ...(arrived ? { arrived } : {}),
            ...(flashes ? { flashes: { count: flashes, elements: flashed } } : {}),
            ...(shift >= 0.001 ? { shift } : {}),
            ...(serverErrors.length ? { serverErrors } : {}),
            url: after.url,
            ...(tab.stepStatus !== null && tab.stepStatus !== 200 ? { status: tab.stepStatus } : {}),
            ...delta(before, after, reloads === 0),
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
      const differing = differs ? differences(on.after, off.after, pageKey) : []
      const elsewhere = results.flatMap((x) => x.elsewhere)
      const ok = changes.every((c) => c.ok)
      steps.push({
        ...base,
        ok,
        note: combine(changes),
        modes: changes,
        ...(differs ? { differs, differences: differing } : {}),
        ...(elsewhere.length ? { elsewhere } : {}),
      })
      if (!ok) failed = true
    }

    modes.forEach((mode, m) => {
      worlds[m]!.serverErrors.forEach((e, i) => {
        const text = describeServerError(e)
        if (
          !inStep[m]!.has(i) &&
          !errors.some((x) => x.kind === 'server' && x.text === text && x.mode === mode)
        )
          errors.push({ kind: 'server', text, at: e.path ?? null, mode })
      })
    })
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
  out.steps.some((s) => !s.ok || s.differs || s.modes?.some((c) => c.serverErrors?.length)) ||
  out.components.some((c) => c.state === 'failed')

const ITEMS = 6
const WIDTH = 60
const TEXT = 600

const cut = (s: string, n: number, full: boolean) => (!full && s.length > n ? `${s.slice(0, n)}…` : s)

const FLASHES_SHOWN = 5

function flashText({ count, elements }: NonNullable<BrowseChange['flashes']>): string {
  const counted = new Map<string, number>()
  for (const e of elements) counted.set(e, (counted.get(e) ?? 0) + 1)
  const named = [...counted].map(([e, n]) => (n > 1 ? `${e} ×${n}` : e))
  const shown = named.slice(0, FLASHES_SHOWN)
  const more = named.length - shown.length
  const list = [...shown, ...(more ? [`${more} more`] : [])].join('; ')
  return `${count} element${count === 1 ? '' : 's'} rebuilt unchanged (a flash${list ? `: ${list}` : ''})`
}

function describeChange(c: BrowseChange, full: boolean, arrival?: string): string {
  if (!c.ok) return `FAILED — ${c.note}`
  if (c.jsOnly) return `js-only (${c.jsOnly})`
  const moved = c.navigated && c.document !== 'in place'
  const items = [
    ...c.added.map((l) => (moved ? cut(l, WIDTH, full) : `+ ${cut(l, WIDTH, full)}`)),
    ...c.removed.map((l) => `− ${cut(l, WIDTH, full)}`),
  ]
  const shown = full ? items : items.slice(0, ITEMS)
  const more = items.length - shown.length
  const list = [...shown, ...(more ? [`… ${more} more`] : [])].join(' · ')
  const status = c.status ? ` (${c.status})` : ''
  const how = [
    c.mode === 'on' && c.document === 'reloaded'
      ? 'the page reloaded'
      : full && c.replaced
        ? `${c.replaced} element${c.replaced === 1 ? '' : 's'} replaced`
        : '',
    c.flashes ? flashText(c.flashes) : '',
    c.shift ? `layout shift ${c.shift}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  const arrived =
    arrival ?? (c.arrived ? ` (${c.arrived.prerendered ? 'prerendered' : 'loaded'}, ${c.arrived.ms} ms)` : '')
  return [c.navigated || status ? `→ ${c.url}${status}${arrived}` : '', how, list].filter(Boolean).join(': ')
}

export function describeBrowse(out: BrowseOutput, full = false): string {
  const modes = out.modes ?? ['on']
  const lines = [
    `BROWSE ${out.path} → ${out.status}${out.url !== out.path ? ` (now ${out.url})` : ''} · ${
      modes.includes('on') ? (out.hydrated ? 'hydrated' : 'not hydrated') : 'no JS'
    } · js ${modes.join('+')}`,
    `  title: ${out.title}`,
  ]
  let noted = false
  out.steps.forEach((s, i) => {
    const who = s.actor ? `${s.actor}: ` : ''
    const head = `  ${i + 1} ${who}${s.step}`
    const changes = s.modes ?? []
    const timed = changes.filter((c) => c.arrived)
    const arrival =
      timed.length > 1
        ? ` (${timed.map((c) => `${c.mode}: ${c.arrived!.prerendered ? 'prerendered' : 'loaded'}, ${c.arrived!.ms} ms`).join('; ')})`
        : undefined
    const texts = changes.map((c) => describeChange(c, full, arrival))
    const flag = !s.differs
      ? ''
      : s.differences?.length
        ? `  ≠ DIFFERS (on vs off): ${s.differences.map((d) => `${shownWords(d.on)} vs ${shownWords(d.off)}`).join('; ')}`
        : '  ≠ DIFFERS: both modes made a request and the resulting text differs'
    if (!changes.length) lines.push(`${head}${s.note ? ` — ${s.note}` : ''}`)
    else if (texts.every((t) => t === texts[0]))
      lines.push(`${head}${texts[0] ? `: ${texts[0]}` : ''}${s.ok && s.note ? ` — ${s.note}` : ''}${flag}`)
    else {
      lines.push(`${head}${flag}`)
      changes.forEach((c) => {
        const own = describeChange(c, full)
        lines.push(`      ${c.mode}: ${own || '(no change)'}${c.ok && c.note ? ` — ${c.note}` : ''}`)
      })
    }
    for (const c of changes)
      for (const text of new Set((c.serverErrors ?? []).map(describeServerError))) {
        lines.push(`      server error${modes.length > 1 ? ` (${c.mode})` : ''}: ${text}`)
        if (!noted) lines.push(`      ${IN_PRODUCTION}`)
        noted = true
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
  for (const e of out.errors) {
    lines.push(
      `  error (${[e.kind, e.type, e.actor, modes.length > 1 ? e.mode : undefined].filter(Boolean).join(', ')}): ${e.text}${
        e.at ? ` at ${e.at}` : ''
      }${e.url && e.url !== e.at ? ` on ${e.url}` : ''}`,
    )
    if (e.kind === 'server' && !noted) lines.push(`    ${IN_PRODUCTION}`)
    if (e.kind === 'server') noted = true
  }
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
