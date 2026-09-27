import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, resolve } from 'node:path'
import { type BuildResult, classCandidates, sha256 } from '@hozu/core/ir'
import { closest } from '@hozu/validator'
import { __unstable__loadDesignSystem, compile, optimize } from '@tailwindcss/node'
import { withFallbacks } from './fonts.ts'

export interface CompiledStyles {
  css: string
  href: string
  assets: Record<string, string>
  preload: string[]
  files: string[]
  candidates: Set<string>
  unknown: Map<string, string | null>
}

const require = createRequire(import.meta.url)

export { classCandidates }

const markers = /^(group|peer)(\/[\w-]+)?$/
const motion = /-(enter-from|enter-active|enter-to|leave-from|leave-active|leave-to|move)$/

const unescapeCss = (id: string) =>
  id.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (_, e: string) =>
    /^[0-9a-fA-F]/.test(e) && e.trim().length > 1 ? String.fromCodePoint(Number.parseInt(e, 16)) : e,
  )

export function selectorClasses(css: string): Set<string> {
  const out = new Set<string>()
  for (const m of css.matchAll(/\.(-?(?:\\[^\n]|[A-Za-z_\u0080-￿])(?:\\[^\n]|[\w\u0080-￿-])*)/g))
    out.add(unescapeCss(m[1]!))
  return out
}

const transitions = `@view-transition { navigation: auto; }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
}`

const foldDivisions = (css: string) =>
  css.replace(/calc\((-?\d*\.?\d+)\s*\/\s*(-?\d*\.?\d+)\)/g, (all, a: string, b: string) => {
    const x = Number(a) / Number(b)
    return Number.isFinite(x) ? String(Number(x.toFixed(5))).replace(/^0\./, '.') : all
  })

const resolveCss = async (id: string) =>
  id === 'tailwindcss' || id.startsWith('tailwindcss/')
    ? require.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id)
    : undefined

export async function compileStyles(
  build: BuildResult,
  { minify = true, base = process.cwd() }: { minify?: boolean; base?: string } = {},
): Promise<CompiledStyles> {
  const { entry, features } = build.bindings.styles
  const imports = [entry ?? 'tailwindcss', ...Object.values(features).flat()]
  const source = [transitions, ...imports.map((file) => `@import ${JSON.stringify(file)};`)].join('\n')
  const files = new Set<string>()
  const compiler = await compile(source, {
    base,
    onDependency: (path) => files.add(path),
    customCssResolver: resolveCss,
    shouldRewriteUrls: true,
  })
  const candidates = classCandidates(build.ir)
  const assets: Record<string, string> = {}
  const raw = compiler
    .build([...candidates])
    .replace(/url\((['"]?)([^'")]+)\1\)/g, (all, quote: string, url: string) => {
      if (/^(data:|https?:|\/\/|#|\/_hozu\/)/.test(url)) return all
      const file = resolve(base, url.split(/[?#]/)[0]!)
      if (!existsSync(file)) return all
      const name = `${sha256(readFileSync(file).toString('base64')).slice(0, 16)}${extname(file).toLowerCase()}`
      assets[`/_hozu/a/${name}`] = file
      return `url(${quote}a/${name}${quote})`
    })
  const fonted = withFallbacks(raw, assets, (file) => readFileSync(file))
  const css = minify ? foldDivisions(optimize(fonted, { minify: true }).code) : fonted
  const known = selectorClasses(raw)
  const unknown = new Map<string, string | null>()
  const missing = [...candidates].filter((c) => !known.has(c) && !markers.test(c)).sort()
  const motions = new Map<string, number>()
  for (const c of missing) {
    const m = motion.exec(c)
    if (m) motions.set(c.slice(0, m.index), (motions.get(c.slice(0, m.index)) ?? 0) + 1)
  }
  for (const c of missing) {
    const m = motion.exec(c)
    if (m && motions.get(c.slice(0, m.index)) === 7) unknown.set(c, null)
  }
  const typos = missing.filter((c) => !motion.test(c))
  if (typos.length) {
    const ds = await __unstable__loadDesignSystem(source, { base })
    const vocabulary = [...new Set([...ds.getClassList().map(([name]) => name), ...known])]
    for (const c of typos) {
      const cut = c.lastIndexOf(':')
      const variant = cut > 0 && !c.slice(0, cut).includes('[') ? c.slice(0, cut + 1) : ''
      const guess = closest(c.slice(variant.length), vocabulary)
      unknown.set(c, guess ? variant + guess : null)
    }
  }
  return {
    css,
    href: `/_hozu/styles.${sha256(css).slice(0, 12)}.css`,
    assets,
    preload: Object.keys(assets).filter((href) => href.endsWith('.woff2')),
    files: [...files],
    candidates,
    unknown,
  }
}

export { type FontMetrics, fallbackFace, fontMetrics } from './fonts.ts'
