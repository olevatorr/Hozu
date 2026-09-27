export interface TruthinessFinding {
  line: number
  column: number
  expression: string
  use:
    | 'a ?: condition'
    | 'the left side of &&'
    | 'the left side of ||'
    | 'the left side of ??'
    | 'the operand of !'
    | 'an if condition'
    | 'a while condition'
}

interface Token {
  text: string
  kind: 'id' | 'punct' | 'literal'
  line: number
  column: number
}

const PUNCT = ['?.', '??=', '??', '&&=', '||=', '&&', '||', '===', '!==', '==', '!=', '=>', '...', '<=', '>=']
const REGEX_BEFORE = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&&',
  '||',
  '??',
  '?',
  '{',
  '}',
  ';',
  'return',
  '=>',
])
const LIST_METHODS = new Set([
  'map',
  'filter',
  'forEach',
  'reduce',
  'some',
  'every',
  'find',
  'flatMap',
  'findIndex',
  'sort',
])

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let lineStart = 0
  const push = (text: string, kind: Token['kind'], start: number) =>
    tokens.push({ text, kind, line, column: start - lineStart + 1 })
  const advance = (to: number) => {
    for (let k = i; k < to; k++)
      if (source[k] === '\n') {
        line++
        lineStart = k + 1
      }
    i = to
  }
  const skipString = (quote: string) => {
    let k = i + 1
    while (k < source.length && source[k] !== quote) k += source[k] === '\\' ? 2 : 1
    return k + 1
  }
  const skipTemplate = () => {
    let k = i + 1
    let depth = 0
    while (k < source.length) {
      const c = source[k]
      if (c === '\\') k += 2
      else if (depth === 0 && c === '`') return k + 1
      else if (c === '$' && source[k + 1] === '{') {
        depth++
        k += 2
      } else if (c === '}' && depth > 0) {
        depth--
        k++
      } else k++
    }
    return k
  }
  while (i < source.length) {
    const c = source[i]!
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r') advance(i + 1)
    else if (c === '/' && source[i + 1] === '/')
      advance(source.indexOf('\n', i) === -1 ? source.length : source.indexOf('\n', i))
    else if (c === '/' && source[i + 1] === '*') advance(source.indexOf('*/', i + 2) + 2)
    else if (c === "'" || c === '"') {
      const start = i
      advance(skipString(c))
      push('"', 'literal', start)
    } else if (c === '`') {
      const start = i
      advance(skipTemplate())
      push('`', 'literal', start)
    } else if (c === '/' && REGEX_BEFORE.has(tokens.at(-1)?.text ?? '(')) {
      const start = i
      let k = i + 1
      let klass = false
      while (k < source.length && (klass || source[k] !== '/')) {
        if (source[k] === '\\') k++
        else if (source[k] === '[') klass = true
        else if (source[k] === ']') klass = false
        k++
      }
      k++
      while (/[a-z]/.test(source[k] ?? '')) k++
      advance(k)
      push('/', 'literal', start)
    } else if (/[A-Za-z_$]/.test(c)) {
      const start = i
      let k = i + 1
      while (/[\w$]/.test(source[k] ?? '')) k++
      advance(k)
      push(source.slice(start, k), 'id', start)
    } else if (/[0-9]/.test(c)) {
      const start = i
      let k = i + 1
      while (/[\w.]/.test(source[k] ?? '')) k++
      advance(k)
      push(source.slice(start, k), 'literal', start)
    } else {
      const start = i
      const p = PUNCT.find((x) => source.startsWith(x, i)) ?? c
      advance(i + p.length)
      push(p, 'punct', start)
    }
  }
  return tokens
}

const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
const CLOSE: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function matchForward(tokens: Token[], at: number): number {
  let depth = 0
  for (let k = at; k < tokens.length; k++) {
    const t = tokens[k]!.text
    if (OPEN[t]) depth++
    else if (CLOSE[t] && --depth === 0) return k
  }
  return tokens.length - 1
}

function matchBackward(tokens: Token[], at: number): number {
  let depth = 0
  for (let k = at; k >= 0; k--) {
    const t = tokens[k]!.text
    if (CLOSE[t]) depth++
    else if (OPEN[t] && --depth === 0) return k
  }
  return 0
}

function bodyEnd(tokens: Token[], start: number): number {
  if (tokens[start]?.text === '{' || tokens[start]?.text === '(') return matchForward(tokens, start)
  let depth = 0
  for (let k = start; k < tokens.length; k++) {
    const t = tokens[k]!.text
    if (OPEN[t]) depth++
    else if (CLOSE[t]) {
      if (depth === 0) return k - 1
      depth--
    } else if (depth === 0 && (t === ',' || t === ';')) return k - 1
  }
  return tokens.length - 1
}

interface Arrow {
  params: string[]
  from: number
  to: number
  real: boolean
}

function arrows(tokens: Token[]): Arrow[] {
  const out: Arrow[] = []
  tokens.forEach((t, k) => {
    if (t.text !== '=>') return
    let first = k - 1
    const params: string[] = []
    if (tokens[k - 1]?.text === ')') {
      first = matchBackward(tokens, k - 1)
      for (let j = first + 1; j < k - 1; j++) {
        const x = tokens[j]!
        const prev = tokens[j - 1]!.text
        if (x.kind === 'id' && prev !== ':' && prev !== '.' && tokens[j + 1]?.text !== ':')
          params.push(x.text)
        if (
          x.kind === 'id' &&
          tokens[j + 1]?.text === ':' &&
          (prev === '{' || prev === ',') &&
          tokens[j + 2]?.kind === 'id'
        )
          params.push(tokens[j + 2]!.text)
      }
    } else if (tokens[k - 1]?.kind === 'id') params.push(tokens[k - 1]!.text)
    const before = tokens[first - 1]
    const callee = before?.text === '(' ? tokens[first - 2] : undefined
    const method = callee?.kind === 'id' && tokens[first - 3]?.text === '.' && LIST_METHODS.has(callee.text)
    const impl = before?.text === ':' && tokens[first - 2]?.text === 'impl'
    out.push({
      params: params.filter((p) => p !== 'when'),
      from: k + 1,
      to: bodyEnd(tokens, k + 1),
      real: method || impl,
    })
  })
  return out
}

export function scanTruthiness(source: string): TruthinessFinding[] {
  const tokens = tokenize(source)
  const list = arrows(tokens)
  const refsAt = (k: number): Set<string> => {
    const refs = new Set<string>()
    const real = new Set<string>()
    for (const a of list)
      if (a.from <= k && k <= a.to) for (const p of a.params) (a.real ? real : refs).add(p)
    for (const p of real) refs.delete(p)
    const insideReal = list.some((a) => a.real && a.from <= k && k <= a.to)
    return insideReal ? new Set() : refs
  }
  const findings: TruthinessFinding[] = []
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]!
    if (t.kind !== 'id' || tokens[k - 1]?.text === '.' || tokens[k - 1]?.text === '?.') continue
    if (!refsAt(k).has(t.text)) continue
    let end = k
    while (
      (tokens[end + 1]?.text === '.' || tokens[end + 1]?.text === '?.') &&
      tokens[end + 2]?.kind === 'id'
    )
      end += 2
    if (tokens[end + 1]?.text === '(') continue
    const next = tokens[end + 1]?.text
    const prev = tokens[k - 1]?.text
    const expression = tokens
      .slice(k, end + 1)
      .map((x) => x.text)
      .join('')
    const use: TruthinessFinding['use'] | null =
      next === '?'
        ? 'a ?: condition'
        : next === '&&'
          ? 'the left side of &&'
          : next === '||'
            ? 'the left side of ||'
            : next === '??'
              ? 'the left side of ??'
              : prev === '!'
                ? 'the operand of !'
                : prev === '(' && next === ')' && tokens[k - 2]?.text === 'if'
                  ? 'an if condition'
                  : prev === '(' && next === ')' && tokens[k - 2]?.text === 'while'
                    ? 'a while condition'
                    : null
    if (use) findings.push({ line: t.line, column: t.column, expression, use })
    k = end
  }
  return findings
}
