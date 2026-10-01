import { type Impact, impact, UnknownSymbolError } from '@hozu/validator'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'

export function runImpact(loaded: Loaded, target: string | undefined): Impact {
  if (!target?.includes('.'))
    throw new HozuCliError('usage', 'Expected <feature>.<symbol>, e.g. hozu impact cart.addItem')
  try {
    return impact(loaded.build().ir, target)
  } catch (error) {
    if (error instanceof UnknownSymbolError)
      throw new HozuCliError('unknown-feature', error.message, error.suggestions)
    throw error
  }
}

export function describeImpact(out: Impact): string {
  const lines = [`${out.target}  (${out.kind})`]
  if (out.tags.length) lines.push(`tags: ${out.tags.join(', ')}`)
  if (out.queries.length)
    lines.push(
      'affects queries:',
      ...out.queries.map(
        (q) => `  ${q.ref} via ${q.tag}${q.precision === 'exact' ? '' : '  (param-dependent)'}`,
      ),
    )
  if (out.invalidatedBy.length) lines.push(`invalidated by: ${out.invalidatedBy.join(', ')}`)
  lines.push('uses:', ...(out.uses.length ? out.uses.map((u) => `  ${u.via}`) : ['  (none)']))
  lines.push(`features: ${out.features.join(', ')}`, '')
  return lines.join('\n')
}
