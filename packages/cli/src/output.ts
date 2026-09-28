import { relative } from 'node:path'
import { canonicalStringify, type Diagnostic } from '@hozu/core/ir'

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

const TOPICS: Record<string, string> = {
  HZ001: 'machine',
  HZ002: 'machine',
  HZ004: 'machine',
  HZ005: 'machine',
  HZ009: 'machine',
  HZ010: 'machine',
  HZ003: 'data',
  HZ021: 'data',
  HZ022: 'data',
  HZ023: 'data',
  HZ014: 'views',
  HZ026: 'views',
  HZ027: 'views',
  HZ028: 'content',
  HZ030: 'views',
  HZ031: 'views',
  HZ032: 'views',
  HZ033: 'forms',
  HZ036: 'forms',
  HZ015: 'contracts',
  HZ016: 'contracts',
  HZ017: 'contracts',
  HZ018: 'contracts',
  HZ024: 'pages',
  HZ025: 'pages',
  HZ035: 'pages',
  HZ029: 'widgets',
  HZ037: 'http',
  HZ038: 'http',
  HZ039: 'http',
  HZ040: 'i18n',
  HZ041: 'i18n',
  HZ042: 'i18n',
  HZ043: 'content',
  HZ044: 'deploy',
  HZ045: 'widgets',
  HZ046: 'endpoints',
  HZ047: 'data',
}

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
  lines.push(`  see: hozu docs ${TOPICS[d.code] ?? 'diagnostics'}`)
  return lines.join('\n')
}
