import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const CATEGORIES = ['edit', 'scaffold', 'check', 'verify', 'docs', 'spec', 'read', 'list', 'other']
const CATEGORIES_V2 = [
  'edit',
  'scaffold',
  'check',
  'verify',
  'serve',
  'docs',
  'spec',
  'read',
  'list',
  'other',
]

const categorize = (name, input) => {
  const text = `${input.command ?? ''} ${input.file_path ?? ''} ${input.path ?? ''} ${input.pattern ?? ''} ${input.skill ?? ''}`
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name)) return 'edit'
  if (name === 'Skill') return 'docs'
  if (/\bsed -i|python3? -|> ?[\w./-]+\.(ts|vue|js|json|css)\b|\btee\b|apply_patch|writeFile/.test(text))
    return 'edit'
  if (/hozu add|create-hozu|nuxi init/.test(text)) return 'scaffold'
  if (/hozu (check|validate)|\btsc\b|typecheck|npm run build|nuxi build|vue-tsc|pnpm build/.test(text))
    return 'check'
  if (
    /hozu (get|post)|\bcurl\b|npm (start|run dev)|node serve|nuxi (dev|preview)|\bkill\b|lsof|\.output\/server/.test(
      text,
    )
  )
    return 'verify'
  if (
    /skills\/hozu|SKILL\.md|reference\.md|patterns\.md|changing\.md|diagnostics\.md|AGENTS\.md|CLAUDE\.md|--help|hozu (map|inspect|explain|graph|plan|docs)/.test(
      text,
    )
  )
    return 'docs'
  if (/spec\.md|change\.md/.test(text)) return 'spec'
  if (name === 'Read' || /\b(cat|sed -n|head|tail|grep|rg|nl|wc)\b/.test(text)) return 'read'
  if (name === 'Glob' || name === 'Grep' || /\b(ls|find|tree)\b/.test(text)) return 'list'
  return 'other'
}

const DOCS =
  /(^|\/)(\.claude\/skills\/|\.agents\/)|SKILL\.md|reference\.md|patterns\.md|changing\.md|diagnostics\.md|AGENTS\.md|CLAUDE\.md|\/topics\//
const SPEC = /(^|\/)(spec|change)\.md$/
const CODE = /\.(ts|tsx|mts|js|mjs|cjs|vue|css|json|html|md)$/
const SCRATCH = /^(\/tmp\/|\/dev\/|\/private\/tmp\/|&)/
const NOISE = new Set(
  'cd export set unset source . sleep echo printf true false wait trap local declare readonly : [ [[ test mkdir chmod touch for while until case esac do done then fi else elif if } { ) exit return shift break continue'.split(
    ' ',
  ),
)
const RUNNERS = [
  /^corepack$/,
  /^npx$/,
  /^bunx$/,
  /^exec$/,
  /^eval$/,
  /^time$/,
  /^nohup$/,
  /^env$/,
  /^command$/,
]
const ASSIGN = /^[A-Za-z_]\w*(\[[^\]]*\])?\+?=/
const BINARIES = new Set([
  'hozu',
  'nuxi',
  'nuxt',
  'tsc',
  'vue-tsc',
  'vitest',
  'create-hozu',
  'biome',
  'playwright',
])

const heredocs = (command) => {
  const bodies = []
  const lines = command.split('\n')
  const kept = []
  for (let i = 0; i < lines.length; i++) {
    kept.push(lines[i])
    for (const m of lines[i].matchAll(/<<-?\s*(['"]?)([\w-]+)\1/g)) {
      const body = []
      while (++i < lines.length && lines[i].trim() !== m[2]) body.push(lines[i])
      bodies.push(body.join('\n'))
    }
  }
  return { script: kept.join('\n'), bodies }
}

const split = (script, operators) => {
  const out = []
  let cur = ''
  let quote = null
  let depth = 0
  for (let i = 0; i < script.length; i++) {
    const ch = script[i]
    if (quote) {
      if (ch === '\\' && quote === '"') {
        cur += ch + (script[++i] ?? '')
        continue
      }
      if (ch === quote) quote = null
      cur += ch
      continue
    }
    if (ch === '\\' && script[i + 1] === '\n') {
      i++
      cur += ' '
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    const op = depth === 0 && operators.find((o) => script.startsWith(o, i))
    if (
      op &&
      !(op === '|' && script[i + 1] === '|') &&
      !(op === '&' && /[&>]/.test(script[i + 1] ?? '')) &&
      !(op === '&' && /[>0-9]/.test(script[i - 1] ?? ''))
    ) {
      out.push(cur)
      cur = ''
      i += op.length - 1
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

const words = (segment) => {
  const out = []
  let cur = ''
  let quote = null
  let depth = 0
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === "'" || ch === '"') quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}
const unquote = (w) => w.replace(/^['"]|['"]$/g, '')

const leading = (segment) => {
  let s = segment.replace(/^[({!\s]+/, '').replace(/^\w+\s*\(\)\s*\{\s*/, '')
  s = s.replace(/^(do|then|else|elif|if|while|until|time|!)\s+/, '')
  const ws = words(s).map(unquote)
  while (ws.length && ASSIGN.test(ws[0])) ws.shift()
  while (ws.length && RUNNERS.some((r) => r.test(ws[0]))) {
    const w = ws.shift()
    if (w === 'env') while (ws.length && ASSIGN.test(ws[0])) ws.shift()
  }
  while (['pnpm', 'yarn'].includes(ws[0]) && (['exec', 'dlx'].includes(ws[1]) || BINARIES.has(ws[1])))
    ws.splice(0, ['exec', 'dlx'].includes(ws[1]) ? 2 : 1)
  if (ws[0] === 'timeout') ws.splice(0, 2)
  if (ws[0] === 'npm' && ws[1] === 'exec') ws.splice(0, ws[2] === '--' ? 3 : 2)
  if (ws[0]) ws[0] = ws[0].replace(/^(\.\/)?node_modules\/\.bin\//, '')
  return ws
}

const writes = (pipeline, cwdScratch) => {
  const targets = []
  for (const el of pipeline) {
    for (const m of el.matchAll(/(?:^|[^<>&0-9])>>?\s*([^\s;&|<>]+)/g)) targets.push(unquote(m[1]))
    const ws = words(el).map(unquote)
    if (ws[0] === 'tee') targets.push(...ws.slice(1).filter((w) => !w.startsWith('-')))
  }
  return targets.some((t) => !SCRATCH.test(t) && !(cwdScratch && !t.includes('/')) && t !== '/dev/null')
}

const body = (text) => {
  if (
    /chromium|playwright|puppeteer|webSocketDebuggerUrl|Runtime\.evaluate|remote-debugging|DevTools/i.test(
      text,
    )
  )
    return 'verify'
  if (/write_text|open\([^)]*['"][wa]b?['"]|writeFileSync|writeFile\(|appendFileSync/.test(text))
    return 'edit'
  if (
    /urllib|http\.client|requests\.(get|post)|\bfetch\(|https?:\/\/(localhost|127\.0\.0\.1)|http\.request/.test(
      text,
    )
  )
    return 'verify'
  return 'read'
}

const hozuSub = (sub) => {
  if (['check', 'validate', 'build', 'test', 'typecheck'].includes(sub)) return 'check'
  if (['browse', 'get', 'post'].includes(sub)) return 'verify'
  if (['serve', 'start', 'dev', 'preview'].includes(sub)) return 'serve'
  if (['add', 'init', 'skill'].includes(sub)) return 'scaffold'
  if (sub === 'migrate') return 'edit'
  return 'docs'
}

const command = (ws, segment, bodies, files) => {
  const [c, a = '', b = ''] = ws
  const rest = ws.slice(1)
  if (!c) return null
  if (rest.includes('--help') || rest.includes('-h')) return 'docs'
  if (c === 'hozu') return hozuSub(a)
  if (c === 'create-hozu' || (c === 'nuxi' && a === 'init')) return 'scaffold'
  if (['nuxi', 'nuxt'].includes(c)) return ['dev', 'preview', 'start'].includes(a) ? 'serve' : 'check'
  if (['npm', 'pnpm', 'yarn'].includes(c)) {
    const script = a === 'run' || a === 'run-script' ? b : a
    if (['install', 'i', 'add', 'ci', 'remove', 'uninstall'].includes(a)) return 'scaffold'
    if (['start', 'dev', 'preview', 'serve'].includes(script)) return 'serve'
    if (['build', 'typecheck', 'check', 'test', 'lint', 'validate', 'generate'].includes(script))
      return 'check'
    return 'other'
  }
  if (['tsc', 'vue-tsc', 'vitest', 'biome', 'eslint'].includes(c)) return 'check'
  if (['kill', 'pkill', 'killall', 'lsof', 'fuser', 'ps', 'pgrep'].includes(c)) return 'serve'
  if (['curl', 'wget', 'http', 'playwright'].includes(c) || /chrom(e|ium)|headless_shell/i.test(c))
    return 'verify'
  if (c === 'node' || c === 'tsx' || c === 'bun' || c === 'deno') {
    if (rest.length === 1 && ['-v', '--version'].includes(rest[0])) return null
    const script = rest.find(
      (w, i) => !w.startsWith('-') && !['--import', '-r', '--require', '--loader'].includes(rest[i - 1]),
    )
    if (rest.includes('-e') || rest.includes('--eval') || rest.includes('-p') || script === '-')
      return body(bodies.join('\n') + segment)
    if (
      script &&
      /(^|\/)serve\.[mc]?[jt]s$|\.output\/server\/index\.mjs$|(^|\/)server\.[mc]?[jt]s$/.test(script)
    )
      return 'serve'
    if (script && files.has(script)) return body(files.get(script))
    return script ? 'verify' : 'other'
  }
  if (/^python3?$/.test(c)) {
    if (rest[0] === '-' || rest[0] === '-c' || !rest.length) return body(bodies.join('\n') + segment)
    return files.has(rest[0]) ? body(files.get(rest[0])) : 'other'
  }
  if (c === 'sed') return rest.some((w) => /^-[a-zA-Z]*i/.test(w)) ? 'edit' : readOf(rest)
  if (c === 'perl') return rest.some((w) => /^-[a-zA-Z]*i/.test(w)) ? 'edit' : 'other'
  if (['patch', 'ed', 'apply_patch'].includes(c)) return 'edit'
  if (c === 'git') {
    if (a === 'stash') return null
    if (['apply', 'checkout', 'restore', 'mv', 'rm', 'reset'].includes(a)) return 'edit'
    if (['ls-files', 'ls-tree'].includes(a)) return 'list'
    if (['show', 'diff', 'log', 'status', 'blame', 'grep'].includes(a)) return 'read'
    return 'other'
  }
  if (c === 'cp' || c === 'mv' || c === 'rm') {
    const args = rest.filter((w) => !w.startsWith('-'))
    const targets = c === 'rm' ? args : args.slice(-1)
    return targets.some((t) => !SCRATCH.test(t) && CODE.test(t)) ? 'edit' : null
  }
  if (
    [
      'cat',
      'head',
      'tail',
      'less',
      'more',
      'nl',
      'wc',
      'grep',
      'rg',
      'ag',
      'awk',
      'jq',
      'diff',
      'cmp',
      'file',
      'stat',
      'od',
      'xxd',
      'strings',
      'sort',
      'uniq',
      'cut',
    ].includes(c)
  )
    return readOf(rest)
  if (['ls', 'find', 'tree', 'fd', 'du', 'which', 'realpath', 'pwd'].includes(c)) return 'list'
  if (NOISE.has(c) || /^\w+\(\)$/.test(c)) return null
  return 'other'
}

const readOf = (args) => {
  const files = args.filter((w) => !w.startsWith('-'))
  if (files.some((f) => DOCS.test(f))) return 'docs'
  if (files.some((f) => SPEC.test(f))) return 'spec'
  return 'read'
}

const bashCategory = (text) => {
  const { script, bodies } = heredocs(text)
  const files = new Map()
  let bi = 0
  for (const line of script.split('\n'))
    for (const m of line.matchAll(/<<-?\s*(['"]?)[\w-]+\1/g)) {
      const target = /(?:>>?|tee(?:\s+-a)?)\s*([^\s;&|<>]+)/.exec(line)?.[1]
      if (target) files.set(unquote(target), bodies[bi])
      bi += m ? 1 : 0
    }
  let scratch = false
  for (const item of split(script, ['&&', '||', ';', '\n', '&'])) {
    const pipeline = split(item, ['|'])
    const ws = leading(pipeline[0])
    if (ws[0] === 'cd') scratch = SCRATCH.test(ws[1] ?? '')
    if (!ws.length) {
      const inner = /\$\((.*)\)/s.exec(pipeline.join(' | '))?.[1]
      const category = inner && bashCategory(inner)
      if (['verify', 'serve', 'check'].includes(category)) return category
      continue
    }
    const category = command(ws, pipeline[0], bodies, files)
    const passive = category === null || ['read', 'other', 'docs', 'spec', 'list'].includes(category)
    if (passive && writes(pipeline, scratch)) return 'edit'
    if (['cat', 'echo', 'printf'].includes(ws[0]) && /(^|[^<>&0-9])>/.test(pipeline.join('|'))) continue
    if (category) return category
  }
  return 'other'
}

export const categorizeV2 = (name, input) => {
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name)) return 'edit'
  if (name === 'Skill') return 'docs'
  const file = input.file_path ?? input.path ?? input.notebook_path ?? ''
  if (name === 'Read') return DOCS.test(file) ? 'docs' : SPEC.test(file) ? 'spec' : 'read'
  if (name === 'Glob' || name === 'Grep' || name === 'LS') return 'list'
  if (name === 'Bash') return bashCategory(input.command ?? '')
  return 'other'
}

const failed = (text) => /✖|Exit code [1-9]|error TS|\berror\b.*HZ\d{3}|ERR!|Error:/.test(text)

export function anatomy(file, { version = 1 } = {}) {
  const classify = version === 2 ? categorizeV2 : categorize
  const categories = version === 2 ? CATEGORIES_V2 : CATEGORIES
  const lines = readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
  const result = lines.findLast((l) => l.type === 'result')
  const calls = []
  const seen = new Map()
  const outputs = new Map()
  for (const l of lines) {
    if (l.type === 'assistant') {
      const m = l.message
      let call = seen.get(m.id)
      if (!call) {
        const u = m.usage
        call = {
          fresh: u.input_tokens + (u.cache_creation_input_tokens ?? 0),
          cached: u.cache_read_input_tokens ?? 0,
          tools: [],
        }
        seen.set(m.id, call)
        calls.push(call)
      }
      for (const c of m.content)
        if (c.type === 'tool_use') call.tools.push({ id: c.id, category: classify(c.name, c.input ?? {}) })
    }
    if (l.type === 'user' && Array.isArray(l.message.content))
      for (const c of l.message.content)
        if (c.type === 'tool_result') {
          const text = typeof c.content === 'string' ? c.content : JSON.stringify(c.content)
          outputs.set(c.tool_use_id, { size: text.length, failed: failed(text) })
        }
  }
  const turns = Object.fromEntries(categories.map((k) => [k, 0]))
  const carried = Object.fromEntries([...categories, 'start'].map((k) => [k, 0]))
  const tools = Object.fromEntries(categories.map((k) => [k, 0]))
  let fixes = 0
  let lastFailed = false
  calls.forEach((call, i) => {
    const category = call.tools[0]?.category ?? 'final'
    turns[category] = (turns[category] ?? 0) + 1
    if (category === 'edit' && lastFailed) fixes++
    for (const t of call.tools) tools[t.category] = (tools[t.category] ?? 0) + 1
    for (const t of call.tools) {
      const out = outputs.get(t.id)
      if (out && ['check', 'verify'].includes(t.category)) lastFailed = out.failed
    }
    const added = i === 0 ? call.fresh + call.cached : call.fresh
    const source = i === 0 ? 'start' : (calls[i - 1].tools[0]?.category ?? 'other')
    carried[source] += added * (1 + 0.1 * (calls.length - i - 1))
  })
  const u = result.usage
  const fresh = u.input_tokens + u.cache_creation_input_tokens
  const cached = u.cache_read_input_tokens * 0.1
  const output = u.output_tokens * 5
  const baseline = calls[0] ? calls[0].fresh + calls[0].cached : 0
  return {
    turns: result.num_turns,
    calls: calls.length,
    weighted: fresh + cached + output,
    fresh,
    cached,
    output,
    baseline,
    baselineCarried: baseline * (1 + 0.1 * (calls.length - 1)),
    turnsBy: turns,
    carriedBy: carried,
    fixes,
    ...(version === 2 && { verifyOrServe: turns.verify + turns.serve, toolsBy: tools }),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const v2 = process.argv.includes('--v2')
  const rows = process.argv
    .slice(2)
    .filter((a) => a !== '--v2')
    .map((f) => [f.split('/').slice(-2).join('/'), anatomy(f, { version: v2 ? 2 : 1 })])
  console.log(JSON.stringify(Object.fromEntries(rows), null, 1))
}
