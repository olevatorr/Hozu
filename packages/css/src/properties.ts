import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type ClassStyle, classVariant, important } from '@hozu/validator'
import { compile, loadModule } from '@tailwindcss/node'

const require = createRequire(import.meta.url)

export const resolveCss = async (id: string) =>
  id === 'tailwindcss' || id.startsWith('tailwindcss/')
    ? require.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id)
    : undefined

export interface DesignSystem {
  theme: { values: Map<string, { value: string }> }
  utilities: {
    keys(kind: 'static' | 'functional'): Iterable<string>
    has(name: string, kind: 'static' | 'functional'): boolean
  }
  candidatesToCss(classes: string[]): (string | null)[]
  getClassOrder(classes: string[]): [string, bigint | null][]
  getClassList(): [string, unknown][]
}

let core: Promise<{
  __unstable__loadDesignSystem: (css: string, o: object) => Promise<DesignSystem>
}> | null = null

const stylesheetPath = async (id: string, base: string) => {
  const own = await resolveCss(id)
  if (own) return own
  if (id.startsWith('.') || isAbsolute(id)) return resolve(base, id)
  return createRequire(join(base, 'index.js')).resolve(id)
}

/** One Tailwind design system for the project's stylesheets, resolved as compileStyles resolves them. */
export async function loadDesignSystem(source: string, base: string): Promise<DesignSystem> {
  core ??= import(pathToFileURL(require.resolve('tailwindcss')).href).then((m) =>
    m.__unstable__loadDesignSystem ? m : m.default,
  )
  return (await core).__unstable__loadDesignSystem(source, {
    base,
    loadStylesheet: async (id: string, from: string) => {
      const path = await stylesheetPath(id, from)
      return { path, base: dirname(path), content: await readFile(path, 'utf8') }
    },
    loadModule: (id: string, from: string) => loadModule(id, from, () => {}),
  })
}

interface Rule {
  selector: string
  context: string[]
  declarations: [property: string, value: string][]
}

function rules(css: string): Rule[] {
  const out: Rule[] = []
  const stack: string[] = []
  const decls: [string, string][][] = []
  let text = ''
  let quote = ''
  const flush = () => {
    const d = text.trim()
    text = ''
    const colon = d.indexOf(':')
    if (colon > 0 && decls.length)
      decls[decls.length - 1]!.push([d.slice(0, colon).trim(), d.slice(colon + 1).trim()])
  }
  const emit = () => {
    const own = decls[decls.length - 1]
    if (!own?.length) return
    const depth = stack.findLastIndex((p) => !p.startsWith('@'))
    if (depth >= 0)
      out.push({
        selector: stack[depth]!,
        context: stack.filter((_, i) => i !== depth),
        declarations: [...own],
      })
    own.length = 0
  }
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!
    if (quote) {
      text += ch
      if (ch === '\\') text += body[++i] ?? ''
      else if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
      text += ch
    } else if (ch === '{') {
      emit()
      stack.push(text.trim())
      decls.push([])
      text = ''
    } else if (ch === ';') flush()
    else if (ch === '}') {
      flush()
      emit()
      stack.pop()
      decls.pop()
    } else text += ch
  }
  return out
}

const unescapeCss = (id: string) =>
  id.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (_, e: string) =>
    /^[0-9a-fA-F]/.test(e) && e.trim().length > 1 ? String.fromCodePoint(Number.parseInt(e, 16)) : e,
  )

const classToken = /\.(-?(?:\\[^\n]|[A-Za-z_\u0080-￿])(?:\\[^\n]|[\w\u0080-￿-])*)/g

const classStart = new RegExp(`^${classToken.source}`)

const splitList = (selector: string) => {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i))
      start = i + 1
    }
  }
  parts.push(selector.slice(start))
  return parts.map((p) => p.trim())
}

/** Where a selector puts the class: '' for the element itself, else the descendant part (`> :not(:last-child)`). */
function targetOf(
  selector: string,
  name: string,
): { before: string; attached: string; target: string } | null {
  for (const m of selector.matchAll(classToken)) {
    if (unescapeCss(m[1]!) !== name) continue
    const end = m.index + m[0].length
    let depth = 0
    let i = end
    for (; i < selector.length; i++) {
      const ch = selector[i]!
      if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') {
        if (depth === 0) break
        depth--
      } else if (depth === 0 && /[\s>+~]/.test(ch)) break
    }
    let close = i
    let d = 0
    for (; close < selector.length; close++) {
      const ch = selector[close]!
      if (ch === '(' || ch === '[') d++
      else if (ch === ')' || ch === ']') {
        if (d === 0) break
        d--
      }
    }
    return {
      before: selector.slice(0, m.index),
      attached: selector.slice(end, i),
      target: selector.slice(i, close).trim(),
    }
  }
  return null
}

const keyOf = (target: string, property: string) => (target ? `${target} ${property}` : property)

function propertiesOf(css: string, name: string): Record<string, string> {
  const props: Record<string, string> = {}
  for (const rule of rules(css)) {
    if (rule.context.some((c) => c.startsWith('@keyframes') || c.startsWith('@property'))) continue
    for (const selector of splitList(rule.selector)) {
      const where = targetOf(selector, name)
      if (!where) continue
      for (const [p, v] of rule.declarations)
        if (!p.startsWith('--')) props[keyOf(where.target, p)] = v.replace(/\s*!important$/, '')
      break
    }
  }
  return props
}

/** Plain rules of the project's stylesheets: `.name` alone or with a descendant part, outside any condition. */
function customProperties(
  css: string,
  names: Set<string>,
): Map<string, { properties: Record<string, string>; layered: boolean; at: number }> {
  const out = new Map<string, { properties: Record<string, string>; layered: boolean; at: number }>()
  let at = 0
  for (const rule of rules(css)) {
    at++
    if (rule.context.some((c) => !c.startsWith('@layer'))) continue
    for (const selector of splitList(rule.selector)) {
      const first = classStart.exec(selector)
      if (!first) continue
      const name = unescapeCss(first[1]!)
      if (!names.has(name)) continue
      const where = targetOf(selector, name)
      if (!where || where.before || where.attached) continue
      const entry = out.get(name) ?? { properties: {}, layered: rule.context.length > 0, at }
      for (const [p, v] of rule.declarations)
        if (!p.startsWith('--')) entry.properties[keyOf(where.target, p)] = v.replace(/\s*!important$/, '')
      out.set(name, entry)
    }
  }
  return out
}

const utilityBlock = (css: string) => {
  const at = css.indexOf('@layer utilities {')
  if (at < 0) return ''
  let depth = 0
  for (let i = at; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1)
  }
  return css.slice(at)
}

/** The baseline's route (bench/ui/baseline.ts): one compiler per class. Used when the design system cannot load. */
async function perClass(source: string, base: string, classes: string[]) {
  const css: (string | null)[] = []
  for (const c of classes) {
    const compiler = await compile(source, { base, customCssResolver: resolveCss, onDependency: () => {} })
    css.push(utilityBlock(compiler.build([c])) || null)
  }
  return css
}

export async function classStyles(
  source: string,
  base: string,
  classes: string[],
  raw: string,
  designSystem = true,
): Promise<{ styles: Map<string, ClassStyle>; ds: DesignSystem | null }> {
  let ds: DesignSystem | null = null
  try {
    if (designSystem) ds = await loadDesignSystem(source, base)
  } catch {}
  const css = ds ? ds.candidatesToCss(classes) : await perClass(source, base, classes)
  const utilities = classes.filter((_, i) => css[i])
  const rank = new Map<string, number>()
  const ordered = ds
    ? ds
        .getClassOrder(utilities)
        .sort(([, a], [, b]) => (a === null ? -1 : b === null ? 1 : a < b ? -1 : a > b ? 1 : 0))
        .map(([c]) => c)
    : [...utilities].sort()
  ordered.forEach((c, i) => rank.set(c, i))
  const custom = customProperties(raw, new Set(classes.filter((_, i) => !css[i])))
  const styles = new Map<string, ClassStyle>()
  classes.forEach((c, i) => {
    const own = css[i]
    const plain = custom.get(c)
    if (!own && !plain) return
    const properties = own ? propertiesOf(own, c) : plain!.properties
    if (!Object.keys(properties).length) return
    styles.set(c, {
      variant: classVariant(c),
      important: important(c),
      properties,
      order: own ? rank.get(c)! : (plain!.layered ? -1e6 : 1e6) + plain!.at,
    })
  })
  return { styles, ds }
}
