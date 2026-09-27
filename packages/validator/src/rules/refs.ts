import { type At, at, type ExportsIR, type JsonPatchOp, parsePointer, resolveAt } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { candidatesFor, registriesOf, resolveRef, splitRef } from '../resolve.ts'
import { refSites } from '../sites.ts'
import { closest, didYouMean } from '../suggest.ts'
import { featurePointer, transitionsOf } from '../walk.ts'

const effectKinds = new Set(['query', 'mutation', 'effect'])

const parent = (p: At) => {
  const s = resolveAt(p)
  return s.slice(0, s.lastIndexOf('/'))
}

function renameKey(pointer: At, value: string, ctx: Ctx): JsonPatchOp[] {
  let node: unknown = ctx.ir
  for (const token of parsePointer(resolveAt(pointer))) node = (node as Record<string, unknown>)[token]
  return [
    { op: 'add', path: resolveAt(at(parent(pointer), value)), value: node as never },
    { op: 'remove', path: resolveAt(pointer) },
  ]
}

export function references(ctx: Ctx) {
  for (const site of refSites(ctx.ir)) {
    const { feature: f, pointer, ref, kind } = site
    if (ref.startsWith('?') || (kind === 'fn' && (ref.startsWith('#') || ref.startsWith('%')))) continue
    const resolved = resolveRef(ctx.ir, ref, kind)
    if (!resolved) {
      const guess = closest(ref, candidatesFor(ctx.ir, f, kind))
      const effect = effectKinds.has(kind)
      const fallback: JsonPatchOp[] | null =
        effect && resolveAt(pointer).endsWith('/invoke/effect')
          ? [{ op: 'replace', path: resolveAt(parent(pointer)), value: null }]
          : null
      ctx.report(
        effect ? 'HZ003' : 'HZ007',
        f.id,
        pointer,
        `Unknown ${kind} "${ref}".${didYouMean(guess)}`,
        effect
          ? 'Effects must be declared as a query or mutation in a feature (its own, or an imported feature that exports it).'
          : `No ${registriesOf[kind].join(' or ')} entry named "${splitRef(ref)[1]}" exists in "${splitRef(ref)[0]}".`,
        {
          summary: guess ? `Use "${guess}"` : `Declare it under ${registriesOf[kind].join(' or ')}`,
          snippet: null,
          patch: guess
            ? site.key
              ? renameKey(pointer, guess, ctx)
              : [{ op: 'replace', path: resolveAt(pointer), value: guess }]
            : fallback,
        },
      )
      continue
    }
    const owner = resolved.feature
    if (owner.id === f.id) continue
    if (site.key) {
      ctx.report(
        'HZ006',
        f.id,
        pointer,
        `Machine of "${f.id}" handles "${ref}", an event owned by "${owner.id}"`,
        'Events are delivered to the machine of the feature that declares them; this handler can never run.',
        {
          summary: 'Remove the handler; react through the owning feature instead',
          snippet: null,
          patch: [{ op: 'remove', path: resolveAt(pointer) }],
        },
      )
      continue
    }
    if (kind === 'widget') {
      ctx.report(
        'HZ006',
        f.id,
        pointer,
        `"${f.id}" uses widget ${ref} owned by "${owner.id}"`,
        'Widgets are private to their feature; share them through an exported view.',
      )
      continue
    }
    const registry = resolved.registry as keyof ExportsIR
    const imported = f.imports.includes(owner.id)
    const exported = owner.exports[registry].includes(resolved.symbol)
    if (imported && exported) continue
    const patch: JsonPatchOp[] = []
    if (!imported)
      patch.push({ op: 'add', path: resolveAt(featurePointer(f.id, 'imports', '-')), value: owner.id })
    if (!exported)
      patch.push({
        op: 'add',
        path: resolveAt(featurePointer(owner.id, 'exports', registry, '-')),
        value: resolved.symbol,
      })
    ctx.report(
      'HZ006',
      f.id,
      pointer,
      `"${f.id}" uses ${ref}${exported ? '' : `, which "${owner.id}" does not export`}${imported ? '' : `, without importing "${owner.id}"`}`,
      'Features may only use declarations that another feature exports, and only after importing that feature.',
      {
        summary: [
          !imported && `add ${owner.id} to imports`,
          !exported && `export ${resolved.symbol} from ${owner.id}`,
        ]
          .filter(Boolean)
          .join(' and '),
        snippet: !imported ? `imports: [${owner.id}]` : `exports: { ${registry}: [${resolved.symbol}] }`,
        patch,
      },
    )
  }
}

export function featureLinks(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features)) {
    f.imports.forEach((id, i) => {
      if (id === '?' || Object.hasOwn(ctx.ir.features, id)) return
      const p = featurePointer(f.id, 'imports', i)
      ctx.report(
        'HZ007',
        f.id,
        p,
        `Imported feature "${id}" does not exist`,
        'Imports must name features of this project.',
        {
          summary: 'Remove the import',
          snippet: null,
          patch: [{ op: 'remove', path: resolveAt(p) }],
        },
      )
    })
    for (const [registry, list] of Object.entries(f.exports) as [keyof ExportsIR, string[]][])
      list.forEach((symbol, i) => {
        if (Object.hasOwn(f[registry], symbol)) return
        const p = featurePointer(f.id, 'exports', registry, i)
        ctx.report(
          'HZ007',
          f.id,
          p,
          `Exported ${registry} entry "${symbol}" does not exist`,
          'A feature can only export its own declarations.',
          {
            summary: 'Remove the export',
            snippet: null,
            patch: [{ op: 'remove', path: resolveAt(p) }],
          },
        )
      })
  }
}

export function routes(ctx: Ctx) {
  const names = Object.keys(ctx.ir.routes)
  for (const f of Object.values(ctx.ir.features))
    for (const site of transitionsOf(f)) {
      const link = site.transition.navigate
      const navigate = link && 'link' in link ? link.link : null
      if (navigate === null || navigate === '?' || Object.hasOwn(ctx.ir.routes, navigate)) continue
      const p = site.at('navigate', 'link')
      const guess = closest(navigate, names)
      ctx.report(
        'HZ007',
        f.id,
        p,
        `Unknown route "${navigate}".${didYouMean(guess)}`,
        `Routes: ${names.join(', ') || '(none)'}.`,
        {
          summary: guess ? `Use "${guess}"` : 'Register the route in project({ routes })',
          snippet: null,
          patch: guess ? [{ op: 'replace', path: resolveAt(p), value: guess }] : null,
        },
      )
    }
}
