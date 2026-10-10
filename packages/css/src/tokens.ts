import { compile } from '@tailwindcss/node'
import { type DesignSystem, loadDesignSystem, resolveCss } from './properties.ts'

export interface DesignTokens {
  theme: string[]
  utilities: string[]
  functional: string[]
}

let defaults: Promise<DesignSystem> | null = null

const CLASS = /\.((?:\\.|[\w-])+)/g

const selectorsOf = (css: string) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{[^{}]*\}/g, '{}')
    .split('{}')
    .flatMap((part) => part.split(/[{}]/).at(-1) ?? '')

/** Plain stylesheet classes such as `.text-mini` that tailwind-merge would read as a Tailwind utility (`text-<color>`). */
export function lookalikes(css: string, ds: DesignSystem): string[] {
  const names = new Set<string>()
  for (const selector of selectorsOf(css))
    for (const [, raw] of selector.matchAll(CLASS)) names.add(raw!.replace(/\\(.)/g, '$1'))
  const found = new Set<string>()
  for (const name of names) {
    const roots = name
      .split('-')
      .slice(0, -1)
      .map((_, i, parts) => parts.slice(0, i + 1).join('-'))
    if (!roots.some((root) => ds.utilities.has(root, 'functional'))) continue
    if (ds.utilities.has(name, 'static') || ds.candidatesToCss([name])[0] !== null) continue
    found.add(name)
  }
  return [...found].sort()
}

export function tokensOf(ds: DesignSystem, plain: DesignSystem, css = ''): DesignTokens {
  const added = (kind: 'static' | 'functional') =>
    [...ds.utilities.keys(kind)].filter((k) => !plain.utilities.has(k, kind)).sort()
  return {
    theme: [...ds.theme.values.keys()].filter((k) => !plain.theme.values.has(k)).sort(),
    utilities: [...new Set([...added('static'), ...lookalikes(css, ds)])].sort(),
    functional: added('functional'),
  }
}

export const defaultDesignSystem = (base: string) =>
  (defaults ??= loadDesignSystem('@import "tailwindcss";', base))

export const plainCss = async (source: string, base: string) =>
  (await compile(source, { base, onDependency: () => {}, customCssResolver: resolveCss })).build([])

/** The `@theme` keys, `@utility` names and Tailwind-like plain classes the project's stylesheets add to Tailwind's defaults. */
export async function designTokens(source: string, base: string): Promise<DesignTokens> {
  const [ds, plain, css] = await Promise.all([
    loadDesignSystem(source, base),
    defaultDesignSystem(base),
    plainCss(source, base),
  ])
  return tokensOf(ds, plain, css)
}
