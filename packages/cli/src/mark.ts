/** The Hozu mark in half blocks, from site/assets/logo.png: d dark, r red, o orange (ADR 0090 B2). */
const MARK = [
  '.dd.............',
  'ddddd.........r.',
  'dddddd......rrrr',
  'dddddd.....rrrrr',
  'dddddd....rrrrrr',
  'dddddd....rrrrrr',
  'dddddd...oorrrrr',
  'dddddddooooorrrr',
  'dddddrooooooorrr',
  'dddrooooooooorrr',
  'ddooooooooorrrrr',
  'ddrooooooorrrrrr',
  'ddddooo...rrrrrr',
  'dddddd....rrrrrr',
  'dddddd....rrrrrr',
  'dddddd....rrrrrr',
  'dddd........rrrr',
  '.d...........rr.',
]

const RGB: Record<string, [number, number, number]> = {
  d: [125, 20, 22],
  r: [251, 58, 14],
  o: [249, 112, 66],
}
const ANSI256: Record<string, number> = { d: 88, r: 202, o: 209 }

type Depth = 'truecolor' | '256' | null

export function colorDepth(stream: { isTTY?: boolean }, env: NodeJS.ProcessEnv): Depth {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return null
  const force = env.FORCE_COLOR
  if (force === '0' || force === 'false') return null
  const forced = force !== undefined
  const ci = env.CI !== undefined && env.CI !== '' && env.CI !== 'false' && env.CI !== '0'
  if (!forced && (!stream.isTTY || env.TERM === 'dumb' || ci)) return null
  return force === '3' || /truecolor|24bit/i.test(env.COLORTERM ?? '') ? 'truecolor' : '256'
}

const paint = (code: string, depth: Exclude<Depth, null>, layer: 38 | 48) =>
  depth === 'truecolor' ? `\x1b[${layer};2;${RGB[code]!.join(';')}m` : `\x1b[${layer};5;${ANSI256[code]}m`

function markLines(depth: Exclude<Depth, null>): string[] {
  const lines: string[] = []
  for (let y = 0; y < MARK.length; y += 2) {
    const top = MARK[y]!
    const bottom = MARK[y + 1] ?? '.'.repeat(top.length)
    let line = ''
    for (let x = 0; x < top.length; x++) {
      const t = top[x]!
      const b = bottom[x]!
      if (t === '.' && b === '.') line += ' '
      else if (t === b) line += `${paint(t, depth, 38)}█\x1b[0m`
      else if (b === '.') line += `${paint(t, depth, 38)}▀\x1b[0m`
      else if (t === '.') line += `${paint(b, depth, 38)}▄\x1b[0m`
      else line += `${paint(t, depth, 38)}${paint(b, depth, 48)}▀\x1b[0m`
    }
    lines.push(line)
  }
  return lines
}

/** The lines `hozu dev` prints: beside the mark on a colour terminal, alone otherwise. */
export function banner(text: string[], depth: Depth): string[] {
  if (!depth) return text
  const mark = markLines(depth)
  const top = Math.max(0, Math.floor((mark.length - text.length) / 2))
  const indent = ' '.repeat(MARK[0]!.length + 3)
  return mark
    .map((line, i) => `${line}   ${text[i - top] ?? ''}`.trimEnd())
    .concat(text.slice(mark.length - top).map((line) => `${indent}${line}`))
}

export const bold = (s: string, depth: Depth) => (depth ? `\x1b[1m${s}\x1b[22m` : s)
export const dim = (s: string, depth: Depth) => (depth ? `\x1b[2m${s}\x1b[22m` : s)
export const red = (s: string, depth: Depth) => (depth ? `${paint('r', depth, 38)}${s}\x1b[39m` : s)
