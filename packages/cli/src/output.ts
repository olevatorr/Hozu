import { relative } from 'node:path'
import { canonicalStringify, codes, type Diagnostic } from '@hozu/core/ir'

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

const CAUSE_LINES = 10

const cap = (cause: string): string => {
  const lines = cause.split('\n')
  if (lines.length <= CAUSE_LINES + 1) return lines.join('\n    ')
  return [
    ...lines.slice(0, CAUSE_LINES + 1),
    `… ${lines.length - CAUSE_LINES - 1} more (--json lists all)`,
  ].join('\n    ')
}

export function human(d: Diagnostic): string {
  const where = d.location.source
    ? `${d.location.source.file}:${d.location.source.line}:${d.location.source.column}`
    : `${d.location.pointer}`
  const lines = [
    `${where}  ${d.severity}  ${d.code}  ${d.message}`,
    `  at ${d.location.pointer}`,
    `  cause: ${cap(d.cause)}`,
  ]
  if (d.fix) lines.push(`  fix: ${d.fix.summary}${d.fix.patch ? ' (patch available with --json)' : ''}`)
  if (d.fix?.snippet) lines.push(d.fix.snippet.replace(/^/gm, '    '))
  lines.push(`  see: hozu docs ${codes[d.code]?.topic ?? 'diagnostics'}`)
  return lines.join('\n')
}
