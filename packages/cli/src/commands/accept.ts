import type { AcceptIR } from '@hozu/core/ir'
import { codes, type Diagnostic } from '@hozu/core/ir'
import type { ValidateOutput } from '../contract.ts'

/** Does an `accept` entry name this warning: an IR pointer prefix, or a declaration the warning is about. */
export const acceptsWarning = (a: AcceptIR, d: Diagnostic): boolean => {
  if (d.code !== a.code || d.severity !== 'warning') return false
  if (a.at.startsWith('/')) return d.location.pointer.startsWith(a.at)
  const dot = a.at.indexOf('.')
  const feature = dot < 0 ? a.at : a.at.slice(0, dot)
  const symbol = dot < 0 ? null : a.at.slice(dot + 1)
  if (d.message.includes(a.at)) return true
  return d.location.feature === feature && (symbol === null || d.location.pointer.split('/').includes(symbol))
}

/**
 * Moves the warnings the project accepts (ADR 0053 C) out of the counted diagnostics into `accepted`, and reports an
 * entry that matches no warning as HZ087.
 */
export function applyAccepted(out: ValidateOutput, accept: AcceptIR[], config: string): ValidateOutput {
  const used = new Set<number>()
  const accepted: ValidateOutput['accepted'] = []
  const kept = out.diagnostics.filter((d) => {
    const i = accept.findIndex((a) => acceptsWarning(a, d))
    if (i < 0) return true
    used.add(i)
    accepted.push({ code: d.code, message: d.message, at: accept[i]!.at, reason: accept[i]!.reason })
    return false
  })
  const stale: Diagnostic[] = accept.flatMap((a, i) =>
    used.has(i)
      ? []
      : [
          {
            code: 'HZ087',
            severity: codes.HZ087.severity,
            message: `accept[${i}] (${a.code} at ${a.at}) matches no warning any more`,
            location: {
              feature: null,
              pointer: `/accept/${i}`,
              source: { file: config, line: 1, column: 1 },
            },
            cause:
              'The warning it kept is gone, or at names something else; a stale entry would hide a new warning later.',
            fix: { summary: 'Remove the entry', snippet: null, patch: null },
          },
        ],
  )
  const diagnostics = [...kept, ...stale]
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  return {
    ...out,
    diagnostics,
    accepted,
    summary: { errors, warnings: diagnostics.length - errors, accepted: accepted.length },
  }
}
