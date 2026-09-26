import type { Json } from '../ir/types.ts'

type Impl = (input: never) => Json

export const i18nFns: Record<string, Impl> = {
  '#msg': function msg(input: { t: string; l: string; a: Record<string, Json> | null }): Json {
    const args = input.a ?? {}
    const rules = new Intl.PluralRules(input.l)
    const numbers = new Intl.NumberFormat(input.l)
    const close = (s: string, from: number) => {
      let depth = 1
      let i = from
      while (i < s.length && depth) {
        if (s[i] === '{') depth++
        else if (s[i] === '}') depth--
        i++
      }
      return i
    }
    const render = (s: string, count: number | null): string => {
      let out = ''
      let i = 0
      while (i < s.length) {
        const c = s[i]!
        if (c === '#' && count !== null) {
          out += numbers.format(count)
          i++
          continue
        }
        if (c !== '{') {
          out += c
          i++
          continue
        }
        const end = close(s, i + 1)
        const body = s.slice(i + 1, end - 1)
        i = end
        const comma = body.indexOf(',')
        if (comma < 0) {
          const value = args[body.trim()]
          out += value === null || value === undefined ? '' : String(value)
          continue
        }
        const name = body.slice(0, comma).trim()
        const rest = body.slice(comma + 1)
        const kind = rest.slice(0, rest.indexOf(',')).trim()
        const cases = rest.slice(rest.indexOf(',') + 1)
        const branches: Record<string, string> = {}
        let k = 0
        while (k < cases.length) {
          const open = cases.indexOf('{', k)
          if (open < 0) break
          const stop = close(cases, open + 1)
          branches[cases.slice(k, open).trim()] = cases.slice(open + 1, stop - 1)
          k = stop
        }
        const value = args[name]
        const n = Number(value)
        const pick =
          kind === 'plural'
            ? (branches[`=${n}`] ?? branches[rules.select(n)] ?? branches.other)
            : (branches[String(value)] ?? branches.other)
        out += pick === undefined ? '' : render(pick, kind === 'plural' ? n : count)
      }
      return out
    }
    return render(input.t, null)
  } as Impl,
  '#number': function number(input: { v: number; o: Intl.NumberFormatOptions; l: string }): Json {
    return typeof input.v === 'number' ? new Intl.NumberFormat(input.l, input.o).format(input.v) : ''
  } as Impl,
  '#date': function date(input: { v: string | number; o: Intl.DateTimeFormatOptions; l: string }): Json {
    const d = new Date(input.v)
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(input.l, input.o).format(d)
  } as Impl,
  '#relative': function relative(input: { v: number; u: Intl.RelativeTimeFormatUnit; l: string }): Json {
    return typeof input.v === 'number'
      ? new Intl.RelativeTimeFormat(input.l, { numeric: 'auto' }).format(input.v, input.u)
      : ''
  } as Impl,
  '#og': function og(input: { title: unknown; subtitle: unknown }): Json {
    const text = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '')
    const query = new URLSearchParams({ title: text(input.title, 120) })
    if (text(input.subtitle, 200)) query.set('subtitle', text(input.subtitle, 200))
    return `/_tenon/og.png?${query}`
  } as Impl,
  '#list': function list(input: { v: string[]; o: Intl.ListFormatOptions; l: string }): Json {
    return Array.isArray(input.v) ? new Intl.ListFormat(input.l, input.o).format(input.v.map(String)) : ''
  } as Impl,
}

export function placeholders(template: string): string[] {
  const names: string[] = []
  let i = 0
  while (i < template.length) {
    const open = template.indexOf('{', i)
    if (open < 0) break
    let depth = 1
    let j = open + 1
    while (j < template.length && depth) {
      if (template[j] === '{') depth++
      else if (template[j] === '}') depth--
      j++
    }
    const body = template.slice(open + 1, j - 1)
    const name = (body.includes(',') ? body.slice(0, body.indexOf(',')) : body).trim()
    if (name && !names.includes(name)) names.push(name)
    i = j
  }
  return names.sort()
}
