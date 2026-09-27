import { codes, type Diagnostic } from '@hozu/core/ir'
import { scanTruthiness } from './truthiness.ts'

export function truthinessDiagnostics(files: Record<string, string>): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const [file, text] of Object.entries(files))
    for (const f of scanTruthiness(text))
      out.push({
        code: 'HZ044',
        severity: codes.HZ044.severity,
        message: `${f.expression} is a recorded reference used as ${f.use}`,
        location: { feature: null, pointer: '', source: { file, line: f.line, column: f.column } },
        cause:
          'References are recorded, not evaluated: as a JavaScript value a reference is always truthy, so this always takes the same branch.',
        fix: {
          summary: `In a view use ui.if(op.neq(${f.expression}, null), […], […]) or op.eq; in a machine use a guard with op.*; to compute a value use fn()`,
          snippet: `ui.if(op.neq(${f.expression}, null), [/* then */], [/* else */])`,
          patch: null,
        },
      })
  return out
}
