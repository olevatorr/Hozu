import { loadDesignSystem } from './properties.ts'

export interface DesignTokens {
  theme: string[]
  utilities: string[]
  functional: string[]
}

/** The `@theme` keys and `@utility` names the project's stylesheets add to Tailwind's defaults. */
export async function designTokens(source: string, base: string): Promise<DesignTokens> {
  const [ds, plain] = await Promise.all([
    loadDesignSystem(source, base),
    loadDesignSystem('@import "tailwindcss";', base),
  ])
  const added = (kind: 'static' | 'functional') =>
    [...ds.utilities.keys(kind)].filter((k) => !plain.utilities.has(k, kind)).sort()
  return {
    theme: [...ds.theme.values.keys()].filter((k) => !plain.theme.values.has(k)).sort(),
    utilities: added('static'),
    functional: added('functional'),
  }
}
