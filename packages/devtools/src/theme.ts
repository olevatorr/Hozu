export interface Theme {
  colors: Record<string, string>
  text: Record<string, number>
  weight: Record<string, number>
  radius: Record<string, number>
  shadow: Record<string, string>
  spacing: number
  own: string[]
}

export type StyleProp =
  | 'fontSize'
  | 'fontWeight'
  | 'color'
  | 'backgroundColor'
  | 'paddingInline'
  | 'paddingBlock'
  | 'borderRadius'
  | 'width'
  | 'height'
  | 'gap'
  | 'opacity'
  | 'borderWidth'
  | 'borderColor'
  | 'boxShadow'

export interface Utility {
  utility: string
  exact: boolean
  nearest: string | null
}

const px = (value: string): number | null => {
  const m = /^(-?[\d.]+)(rem|px)?$/.exec(value.trim())
  if (!m) return null
  return Number(m[1]) * (m[2] === 'rem' ? 16 : 1)
}

const hex2 = (n: number) =>
  Math.round(Math.min(1, Math.max(0, n)) * 255)
    .toString(16)
    .padStart(2, '0')

const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
const linear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)

export function oklchToHex(value: string): string | null {
  const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(value.trim())
  if (!m) return null
  const L = Number(m[1]) / (m[2] ? 100 : 1)
  const C = Number(m[3])
  const H = (Number(m[4]) * Math.PI) / 180
  const a = C * Math.cos(H)
  const b = C * Math.sin(H)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s
  return `#${hex2(gamma(r))}${hex2(gamma(g))}${hex2(gamma(bl))}`
}

export const normalHex = (value: string): string | null => {
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v)
  if (rgb)
    return `#${rgb
      .slice(1, 4)
      .map((c) => hex2(Number(c) / 255))
      .join('')}`
  return v.startsWith('oklch(') ? oklchToHex(v) : null
}

const lab = (hex: string): [number, number, number] => {
  const [r, g, b] = [1, 3, 5].map((i) => linear(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const distance = (a: string, b: string) => {
  const [x, y] = [lab(a), lab(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

function declarations(css: string, onlyTheme: boolean): [string, string][] {
  const blocks = onlyTheme ? [...css.matchAll(/@theme[^{]*\{([\s\S]*?)\}/g)].map((m) => m[1]!) : [css]
  return blocks.flatMap((block) =>
    [...block.matchAll(/--([\w-]+(?:-\*)?)\s*:\s*([^;]+);/g)].map(
      (m) => [m[1]!, m[2]!.trim()] as [string, string],
    ),
  )
}

export function parseTheme(base: string, project: string): Theme {
  const theme: Theme = { colors: {}, text: {}, weight: {}, radius: {}, shadow: {}, spacing: 4, own: [] }
  const apply = (name: string, value: string, own: boolean) => {
    if (value === 'initial' && name.endsWith('-*')) {
      const space = name.slice(0, -2)
      if (space === 'color') theme.colors = {}
      if (space === 'text') theme.text = {}
      if (space === 'radius') theme.radius = {}
      if (space === 'font-weight') theme.weight = {}
      if (space === 'shadow') theme.shadow = {}
      return
    }
    if (name.includes('--')) return
    const set = <T>(target: Record<string, T>, key: string, v: T | null) => {
      if (v !== null) target[key] = v
    }
    if (name === 'spacing') theme.spacing = px(value) ?? theme.spacing
    else if (name.startsWith('color-')) {
      const key = name.slice(6)
      set(theme.colors, key, normalHex(value))
      if (own && theme.colors[key] && !theme.own.includes(key)) theme.own.push(key)
    } else if (name.startsWith('text-')) set(theme.text, name.slice(5), px(value))
    else if (name.startsWith('font-weight-')) set(theme.weight, name.slice(12), Number(value) || null)
    else if (name.startsWith('radius-')) set(theme.radius, name.slice(7), px(value))
    else if (name.startsWith('shadow-')) theme.shadow[name.slice(7)] = value
  }
  for (const [n, v] of declarations(base, false)) apply(n, v, false)
  for (const [n, v] of declarations(project, true)) apply(n, v, true)
  return theme
}

const prefix: Record<StyleProp, string> = {
  fontSize: 'text',
  fontWeight: 'font',
  color: 'text',
  backgroundColor: 'bg',
  paddingInline: 'px',
  paddingBlock: 'py',
  borderRadius: 'rounded',
  width: 'w',
  height: 'h',
  gap: 'gap',
  opacity: 'opacity',
  borderWidth: 'border',
  borderColor: 'border',
  boxShadow: 'shadow',
}

export const borderSteps = [0, 1, 2, 4, 8]

const closest = (table: Record<string, number>, v: number) =>
  Object.entries(table).reduce<[string, number] | null>(
    (best, entry) => (!best || Math.abs(entry[1] - v) < Math.abs(best[1] - v) ? entry : best),
    null,
  )

export function utilityFor(prop: StyleProp, value: string, theme: Theme): Utility {
  const p = prefix[prop]
  if (prop === 'color' || prop === 'backgroundColor' || prop === 'borderColor') {
    const hex = normalHex(value) ?? value
    const names = [...theme.own, ...Object.keys(theme.colors).filter((n) => !theme.own.includes(n))]
    let best: string | null = null
    let gap = Number.POSITIVE_INFINITY
    for (const name of names) {
      const d = distance(hex, theme.colors[name]!)
      if (d < gap - 1e-9) [best, gap] = [name, d]
    }
    if (best && gap < 0.004) return { utility: `${p}-${best}`, exact: true, nearest: null }
    return { utility: `${p}-[${hex}]`, exact: false, nearest: best ? `${p}-${best}` : null }
  }
  if (prop === 'fontWeight') {
    const v = Number(value)
    const hit = Object.entries(theme.weight).find(([, w]) => w === v)
    if (hit) return { utility: `font-${hit[0]}`, exact: true, nearest: null }
    const near = closest(theme.weight, v)
    return { utility: `font-[${v}]`, exact: false, nearest: near ? `font-${near[0]}` : null }
  }
  if (prop === 'boxShadow') {
    if (value === 'none') return { utility: 'shadow-none', exact: true, nearest: null }
    const hit = Object.entries(theme.shadow).find(([, v]) => v === value)
    if (hit) return { utility: `shadow-${hit[0]}`, exact: true, nearest: null }
    return { utility: `shadow-[${value.replace(/\s+/g, '_')}]`, exact: false, nearest: null }
  }
  if (prop === 'opacity') {
    const pct = Math.round(Number(value) * 1000) / 10
    if (Number.isInteger(pct / 5)) return { utility: `opacity-${pct}`, exact: true, nearest: null }
    return { utility: `opacity-[${value}]`, exact: false, nearest: `opacity-${Math.round(pct / 5) * 5}` }
  }
  if ((prop === 'width' || prop === 'height') && (value === 'auto' || value === '100%'))
    return { utility: `${p}-${value === 'auto' ? 'auto' : 'full'}`, exact: true, nearest: null }
  const v = px(value) ?? 0
  if (prop === 'borderWidth') {
    if (v === 1) return { utility: 'border', exact: true, nearest: null }
    if (borderSteps.includes(v)) return { utility: `border-${v}`, exact: true, nearest: null }
    return { utility: `border-[${v}px]`, exact: false, nearest: null }
  }
  if (
    prop === 'paddingInline' ||
    prop === 'paddingBlock' ||
    prop === 'gap' ||
    prop === 'width' ||
    prop === 'height'
  ) {
    const steps = v / theme.spacing
    if (Number.isInteger(steps * 4)) return { utility: `${p}-${steps}`, exact: true, nearest: null }
    return { utility: `${p}-[${v}px]`, exact: false, nearest: `${p}-${Math.round(steps * 2) / 2}` }
  }
  if (prop === 'borderRadius') {
    if (v >= 9999) return { utility: 'rounded-full', exact: true, nearest: null }
    if (v === 0) return { utility: 'rounded-none', exact: true, nearest: null }
  }
  const table = prop === 'fontSize' ? theme.text : theme.radius
  const hit = Object.entries(table).find(([, t]) => Math.abs(t - v) < 0.5)
  if (hit) return { utility: `${p}-${hit[0]}`, exact: true, nearest: null }
  const near = closest(table, v)
  return { utility: `${p}-[${v}px]`, exact: false, nearest: near ? `${p}-${near[0]}` : null }
}

export function currentUtility(prop: StyleProp, classes: string, theme: Theme): string | null {
  const isSize = (name: string) => name in theme.text || /^\[[\d.]+(px|rem)\]$/.test(name)
  const isColor = (name: string) =>
    name in theme.colors ||
    /^\[#|^\[(rgb|oklch)/.test(name) ||
    /^(white|black|transparent|current)$/.test(name)
  const tests: Record<StyleProp, (c: string) => boolean> = {
    fontSize: (c) => c.startsWith('text-') && isSize(c.slice(5)),
    color: (c) => c.startsWith('text-') && isColor(c.slice(5)),
    backgroundColor: (c) => c.startsWith('bg-') && isColor(c.slice(3)),
    fontWeight: (c) => c.startsWith('font-') && (c.slice(5) in theme.weight || /^\[\d+\]$/.test(c.slice(5))),
    paddingInline: (c) => /^(px|p)-/.test(c),
    paddingBlock: (c) => /^(py|p)-/.test(c),
    borderRadius: (c) =>
      c === 'rounded' ||
      (c.startsWith('rounded-') && (c.slice(8) in theme.radius || /^(none|full|\[)/.test(c.slice(8)))),
    width: (c) => /^w-/.test(c),
    height: (c) => /^h-/.test(c),
    gap: (c) => /^gap-/.test(c),
    opacity: (c) => /^opacity-/.test(c),
    borderWidth: (c) => c === 'border' || /^border-(\d|\[\d)/.test(c),
    borderColor: (c) => c.startsWith('border-') && isColor(c.slice(7)),
    boxShadow: (c) =>
      c === 'shadow' ||
      (c.startsWith('shadow-') && (c.slice(7) in theme.shadow || /^(none|\[)/.test(c.slice(7)))),
  }
  const found = classes
    .split(/\s+/)
    .filter((c) => c && !c.includes(':'))
    .filter((c) => tests[prop](c.replace(/!$/, '')))
  return found.at(-1) ?? null
}

const arbitrary = (raw: string): string | null => {
  const m = /^\[(-?[\d.]+)(px|rem)\]$/.exec(raw)
  return m ? `${Number(m[1]) * (m[2] === 'rem' ? 16 : 1)}px` : null
}

/** The value a theme utility sets, so the panel shows the element's own value, not a `:hover` one (0.17.1). */
export function utilityValue(prop: StyleProp, utility: string, theme: Theme): string | null {
  const u = utility.replace(/!$/, '')
  const dash = u.indexOf('-')
  const name = dash < 0 ? '' : u.slice(dash + 1)
  const step = (n: string) => (/^\d+(\.\d+)?$/.test(n) ? `${Number(n) * theme.spacing}px` : arbitrary(n))
  switch (prop) {
    case 'color':
    case 'backgroundColor':
    case 'borderColor': {
      const hex = /^\[(#[0-9a-fA-F]{3,6})\]$/.exec(name)?.[1]
      if (hex) return normalHex(hex)
      if (name === 'transparent') return 'transparent'
      if (name === 'white') return '#ffffff'
      if (name === 'black') return '#000000'
      return theme.colors[name] ?? null
    }
    case 'fontSize':
      return name in theme.text ? `${theme.text[name]}px` : arbitrary(name)
    case 'fontWeight':
      return name in theme.weight ? String(theme.weight[name]) : (/^\[(\d+)\]$/.exec(name)?.[1] ?? null)
    case 'borderRadius':
      if (u === 'rounded') return null
      if (name === 'none') return '0px'
      if (name === 'full') return '9999px'
      return name in theme.radius ? `${theme.radius[name]}px` : arbitrary(name)
    case 'paddingInline':
    case 'paddingBlock':
    case 'gap':
      return step(name)
    case 'width':
    case 'height':
      return name === 'full' ? '100%' : name === 'auto' ? 'auto' : step(name)
    case 'opacity':
      return /^\d+$/.test(name) ? String(Number(name) / 100) : null
    case 'borderWidth':
      return u === 'border' ? '1px' : /^\d+$/.test(name) ? `${name}px` : arbitrary(name)
    case 'boxShadow':
      return name === 'none' ? 'none' : (theme.shadow[name] ?? null)
  }
}
