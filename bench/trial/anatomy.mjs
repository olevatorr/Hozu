import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const CATEGORIES = ['edit', 'scaffold', 'check', 'verify', 'docs', 'spec', 'read', 'list', 'other']

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
    /skills\/hozu|SKILL\.md|reference\.md|patterns\.md|changing\.md|diagnostics\.md|AGENTS\.md|CLAUDE\.md|--help|hozu (map|inspect|explain|graph|plan)/.test(
      text,
    )
  )
    return 'docs'
  if (/spec\.md|change\.md/.test(text)) return 'spec'
  if (name === 'Read' || /\b(cat|sed -n|head|tail|grep|rg|nl|wc)\b/.test(text)) return 'read'
  if (name === 'Glob' || name === 'Grep' || /\b(ls|find|tree)\b/.test(text)) return 'list'
  return 'other'
}

const failed = (text) => /✖|Exit code [1-9]|error TS|\berror\b.*HZ\d{3}|ERR!|Error:/.test(text)

export function anatomy(file) {
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
        if (c.type === 'tool_use') call.tools.push({ id: c.id, category: categorize(c.name, c.input ?? {}) })
    }
    if (l.type === 'user' && Array.isArray(l.message.content))
      for (const c of l.message.content)
        if (c.type === 'tool_result') {
          const text = typeof c.content === 'string' ? c.content : JSON.stringify(c.content)
          outputs.set(c.tool_use_id, { size: text.length, failed: failed(text) })
        }
  }
  const turns = Object.fromEntries(CATEGORIES.map((k) => [k, 0]))
  const carried = Object.fromEntries([...CATEGORIES, 'start'].map((k) => [k, 0]))
  let fixes = 0
  let lastFailed = false
  calls.forEach((call, i) => {
    const category = call.tools[0]?.category ?? 'final'
    turns[category] = (turns[category] ?? 0) + 1
    if (category === 'edit' && lastFailed) fixes++
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
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = process.argv.slice(2).map((f) => [f.split('/').slice(-2).join('/'), anatomy(f)])
  console.log(JSON.stringify(Object.fromEntries(rows), null, 1))
}
