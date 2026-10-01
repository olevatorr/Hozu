import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { anatomy } from '../anatomy.mjs'
import { codeFiles, git, isCode, show } from './code.mjs'
import { diagnosticsOf } from './diagnostics.mjs'
import { duplication } from './dup.mjs'
import { computeLock, lockMetrics } from './lock-state.mjs'

const [fw, app, stepArg, out, raw = out] = process.argv.slice(2)
const step = Number(stepArg)
const nn = String(step).padStart(2, '0')
const pp = String(step - 1).padStart(2, '0')
const file = (s, n = nn) =>
  [raw, out].map((d) => join(d, `${n}.${s}`)).find(existsSync) ?? join(out, `${n}.${s}`)
const json = (s, n) => (existsSync(file(s, n)) ? JSON.parse(readFileSync(file(s, n), 'utf8')) : null)
const txt = (s) => (existsSync(file(s)) ? readFileSync(file(s), 'utf8').trim() : null)
const tag = process.env.TAG ?? `s${nn}`
const prev = process.env.PREV_TAG || (step === 0 ? 'scaffold' : `s${pp}`)

const lines = (ref) => codeFiles(app, ref).reduce((n, f) => n + show(app, ref, f).split('\n').length, 0)
const diff = git(app, 'diff', '--numstat', prev, tag)
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split('\t'))
  .filter(([, , f]) => isCode(f))
  .reduce((a, [add, del]) => ({ added: a.added + (+add || 0), removed: a.removed + (+del || 0) }), {
    added: 0,
    removed: 0,
  })

const transcript = file('jsonl')
const records = existsSync(transcript)
  ? readFileSync(transcript, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  : []
const result = records.findLast((r) => r.type === 'result')
const finalText = result?.result ?? ''
let cost = null
try {
  const a = anatomy(transcript, { version: 2 })
  cost = {
    weighted: Math.round(a.weighted),
    calls: a.calls,
    output: a.output / 5,
    fresh: a.fresh,
    cached: Math.round(a.cached * 10),
    turnsBy: a.turnsBy,
    carriedBy: Object.fromEntries(Object.entries(a.carriedBy).map(([k, v]) => [k, Math.round(v)])),
    fixes: a.fixes,
    verifyOrServe: a.verifyOrServe,
    toolsBy: a.toolsBy,
  }
} catch (e) {
  cost = { error: String(e.message).slice(0, 120) }
}
const uses = new Map(
  records
    .filter((r) => r.type === 'assistant')
    .flatMap((r) => r.message.content.filter((c) => c.type === 'tool_use').map((c) => [c.id, c])),
)
const commands = [...uses.values()].map((c) => c.input?.command ?? '')
const toolResults = records
  .filter((r) => r.type === 'user' && Array.isArray(r.message?.content))
  .flatMap((r) => r.message.content.filter((c) => c.type === 'tool_result'))
  .map((c) => ({
    command: uses.get(c.tool_use_id)?.input?.command ?? '',
    text: typeof c.content === 'string' ? c.content : JSON.stringify(c.content),
  }))
const seen = diagnosticsOf(toolResults)

const admits =
  /\b(could not|couldn't|cannot|can't|unable to|not (yet )?(implemented|working|supported|done)|does not work|doesn't work|failing|still fails?|partial(ly)?|did not|didn't|TODO|known (issue|limitation)|limitation|skipped|not verified)\b|無法|沒有確認|未確認|沒確認|未驗證|沒有驗證|還是會|仍然會|仍會|沒有成功|未完成|做不到|不支援/i
const accept = json('accept.json')
const before = step === 0 ? { failures: [] } : json('accept.json', pp)
const failing = (a) => new Set((a?.failures ?? []).map((f) => f.id))
const introduced = accept ? [...failing(accept)].filter((id) => !before || !failing(before).has(id)) : null
const silentHint = Boolean(
  accept && accept.total > accept.passed && result && !result.is_error && !admits.test(finalText),
)
const row = {
  fw,
  step,
  tools: 2,
  commit: git(app, 'rev-parse', '--short', tag).trim(),
  attempts: +(txt('attempts') ?? 1),
  timedOut: txt('exit') === '142',
  accept: accept && {
    passed: accept.passed,
    total: accept.total,
    new: accept.new,
    regression: accept.regression,
    failures: accept.failures.map((f) => `${f.kind}:${f.id}`),
  },
  introduced,
  introducedBase: before ? `${step === 0 ? 'none' : pp}` : null,
  silentReview: Boolean(introduced?.length && result && !result.is_error),
  silentHint,
  admitsProblem: admits.test(finalText),
  final: finalText.slice(-600),
  cost,
  size: { lines: lines(tag), ...diff },
  duplication: duplication(app, tag),
  js: accept?.js ?? null,
}
if (fw === 'hozu') {
  const check = json('check.json')
  const d = check?.validate?.diagnostics ?? []
  const coverage = Object.values(check?.validate?.coverage ?? {})
  const lock = (ref) => {
    try {
      return JSON.parse(show(app, ref, 'hozu.lock.json')).features ?? {}
    } catch {
      return {}
    }
  }
  const flat = (l) =>
    Object.fromEntries(
      Object.entries(l).flatMap(([f, e]) => Object.entries(e).map(([k, v]) => [`${f}/${k}`, v.behavior])),
    )
  const [a, b] = [flat(lock(prev)), flat(lock(tag))]
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const inspect = json('inspect.json') ?? []
  row.hozu = {
    checkOk: check?.ok ?? false,
    typesOk: check?.types?.ok ?? false,
    errors: check?.validate?.summary?.errors ?? null,
    warnings: check?.validate?.summary?.warnings ?? null,
    codes: [...new Set(d.map((x) => x.code))],
    deadStates: d.filter((x) => x.code === 'HZ001').length,
    contracts: coverage.reduce((s, c) => ({ covered: s.covered + c.covered, total: s.total + c.total }), {
      covered: 0,
      total: 0,
    }),
    lockEntries: Object.keys(b).length,
    lockChanged: [...keys].filter((k) => a[k] !== b[k]).length,
    states: inspect.reduce((s, x) => s + (x.summary?.states ?? 0), 0),
    transitions: inspect.reduce((s, x) => s + (x.summary?.transitions ?? 0), 0),
    diagnosticsSeen: seen.codes,
    hz018: seen.hz018,
    hz057: seen.hz057,
    lock: lockMetrics(computeLock(app, tag)),
    updateLockRuns: commands.filter((c) => c.includes('--update-lock')).length,
    buildOk: txt('build.exit') === '0',
  }
} else {
  row.nuxt = { typecheckOk: txt('typecheck.exit') === '0', buildOk: txt('build.exit') === '0' }
}
console.log(JSON.stringify(row))
