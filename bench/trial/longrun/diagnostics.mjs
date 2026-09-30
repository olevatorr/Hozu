const CHECK = /\bhozu\s+(check|validate)\b/
const LINE = /^(\S+)\s{2}(error|warning)\s{2}(HZ\d{3})\s{2}(.*)$/

const wasNow = (text) => {
  const m =
    /\(was: (.*); now: (.*)\)\.?\s*$/.exec(text ?? '') ??
    /\((?:was: (.*); )?now: (.*)\)\.?\s*$/.exec(text ?? '')
  return m ? m[1] === m[2] : null
}

const human = (text) => {
  const out = []
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    const m = LINE.exec(line)
    if (!m) return
    const block = []
    for (let j = i + 1; j < lines.length && /^\s{2}/.test(lines[j]); j++) block.push(lines[j].trim())
    const at = block.find((l) => l.startsWith('at '))?.slice(3) ?? m[1]
    const cause = block.find((l) => l.startsWith('cause: '))?.slice(7) ?? ''
    out.push({ code: m[3], severity: m[2], pointer: at, identical: wasNow(cause) ?? wasNow(m[4]) })
  })
  return out
}

const fromJson = (text) => {
  const out = []
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      if (typeof v.code === 'string' && /^HZ\d{3}$/.test(v.code) && v.severity && v.location)
        out.push({
          code: v.code,
          severity: v.severity,
          pointer: v.location.pointer ?? '',
          identical: wasNow(v.cause) ?? wasNow(v.message),
        })
      else Object.values(v).forEach(walk)
    }
  }
  const start = text.indexOf('{')
  if (start < 0) return null
  try {
    walk(JSON.parse(text.slice(start)))
    return out
  } catch {
    const loose = []
    for (const m of text.matchAll(/"code":\s*"(HZ\d{3})"/g)) {
      const near = text.slice(Math.max(0, m.index - 600), m.index + 600)
      loose.push({
        code: m[1],
        severity: /"severity":\s*"(error|warning)"/.exec(near)?.[1] ?? 'error',
        pointer: /"pointer":\s*"([^"]*)"/.exec(near)?.[1] ?? '',
        identical: wasNow(/"cause":\s*"((?:\\.|[^"])*)"/.exec(near)?.[1]),
      })
    }
    return loose
  }
}

const tally = (list) => ({
  count: list.length,
  blocking: list.filter((d) => d.severity === 'error').length,
  warnings: list.filter((d) => d.severity !== 'error').length,
  identical: list.filter((d) => d.identical === true).length,
  distinct: new Set(list.map((d) => d.pointer)).size,
})

export function diagnosticsOf(results) {
  const all = []
  const runs = { HZ018: 0, HZ057: 0 }
  let checks = 0
  for (const { command, text } of results) {
    if (!CHECK.test(command)) continue
    checks++
    const found = [...human(text), ...(human(text).length ? [] : (fromJson(text) ?? []))]
    for (const code of Object.keys(runs)) if (found.some((d) => d.code === code)) runs[code]++
    all.push(...found)
  }
  const codes = {}
  for (const d of all) codes[d.code] = (codes[d.code] ?? 0) + 1
  const of = (code) => ({ ...tally(all.filter((d) => d.code === code)), runs: runs[code] })
  return { checks, codes, hz018: of('HZ018'), hz057: of('HZ057') }
}
