import { transform } from './transform.ts'

export function hozuTransform() {
  return {
    name: 'hozu-transform',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?')[0]!
      if (!/\.(m|c)?ts$/.test(file) || file.includes('/node_modules/') || !code.includes('@hozu/core'))
        return null
      const out = transform(code, file)
      return out.changed ? { code: out.code, map: { mappings: '' } } : null
    },
  }
}
