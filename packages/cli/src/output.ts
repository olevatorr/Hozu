import { relative } from 'node:path'
import { canonicalStringify, type Diagnostic } from '@tenon/core/ir'

export const json = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalStringify(value)), null, 2)}\n`

export const relativize = (diagnostics: Diagnostic[], cwd: string): Diagnostic[] =>
  diagnostics.map((d) =>
    d.location.source
      ? {
          ...d,
          location: {
            ...d.location,
            source: { ...d.location.source, file: relative(cwd, d.location.source.file) },
          },
        }
      : d,
  )

export function human(d: Diagnostic): string {
  const where = d.location.source
    ? `${d.location.source.file}:${d.location.source.line}:${d.location.source.column}`
    : `${d.location.pointer}`
  const lines = [
    `${where}  ${d.severity}  ${d.code}  ${d.message}`,
    `  at ${d.location.pointer}`,
    `  cause: ${d.cause}`,
  ]
  if (d.fix) lines.push(`  fix: ${d.fix.summary}${d.fix.patch ? ' (patch available with --json)' : ''}`)
  if (d.fix?.snippet) lines.push(d.fix.snippet.replace(/^/gm, '    '))
  return lines.join('\n')
}
