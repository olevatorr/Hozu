import { type DesignSystem, loadDesignSystem } from './properties.ts'

export interface DesignTokens {
  theme: string[]
  utilities: string[]
  functional: string[]
}

let defaults: Promise<DesignSystem> | null = null

export function tokensOf(ds: DesignSystem, plain: DesignSystem): DesignTokens {
  const added = (kind: 'static' | 'functional') =>
    [...ds.utilities.keys(kind)].filter((k) => !plain.utilities.has(k, kind)).sort()
  return {
    theme: [...ds.theme.values.keys()].filter((k) => !plain.theme.values.has(k)).sort(),
    utilities: added('static'),
    functional: added('functional'),
  }
}

export const defaultDesignSystem = (base: string) =>
  (defaults ??= loadDesignSystem('@import "tailwindcss";', base))

/** The `@theme` keys and `@utility` names the project's stylesheets add to Tailwind's defaults. */
export async function designTokens(source: string, base: string): Promise<DesignTokens> {
  const [ds, plain] = await Promise.all([loadDesignSystem(source, base), defaultDesignSystem(base)])
  return tokensOf(ds, plain)
}
