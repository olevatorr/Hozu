import type { DiagnosticCode } from '@hozu/core/ir'

export interface Claim {
  id: string
  label: string
  value: string
  trial: string
}
export const claims: Claim[] = [
  { id: 'tokens', label: 'Tokens per change, against Nuxt', value: '1.34–1.72×', trial: '0021-0-8-long-run' },
  { id: 'regressions', label: 'Regressions in 16 changes', value: '0', trial: '0021-0-8-long-run' },
  { id: 'silent', label: 'Silent failures in 16 changes', value: '0', trial: '0021-0-8-long-run' },
  { id: 'old', label: 'Regression failures on 0.7, same app', value: '8', trial: '0020-long-run' },
  { id: 'calls', label: 'Tool calls, steps 13–28', value: '270 vs 193', trial: '0021-0-8-long-run' },
  {
    id: 'js',
    label: 'Client JS on the notes list',
    value: '24.0 KB vs 233.9 KB',
    trial: '0021-0-8-long-run',
  },
  {
    id: 'nuxt',
    label: 'Checks passed after one change',
    value: '72/72 vs 67/72',
    trial: '0012-correctness-notes',
  },
]
export const claim = (id: string): Claim => {
  const found = claims.find((c) => c.id === id)
  if (!found) throw new Error(`unknown claim ${id}`)
  return found
}
export const catches: { code: DiagnosticCode; name: string; story: string; message: string; fix: string }[] =
  [
    {
      code: 'HZ049',
      name: 'cached-user-data',
      story: 'Your notes, on someone else’s screen.',
      message: 'A user-scoped query is cached across requests.',
      fix: "freshness: 'request'",
    },
    {
      code: 'HZ054',
      name: 'single-value-form-read',
      story: 'You ticked three boxes. The app saw one.',
      message: 'A multi-value field is read with ui.dom.form.',
      fix: 'ui.dom.formAll(name)',
    },
    {
      code: 'HZ052',
      name: 'unserved-route',
      story: 'A link to a page nothing serves.',
      message: 'A route has no page and no endpoint.',
      fix: 'Add a page, or link to the endpoint',
    },
    {
      code: 'HZ057',
      name: 'lock-out-of-date',
      story: 'Behaviour changed. Nobody reviewed it.',
      message: 'The lock differs from the computed lock.',
      fix: 'hozu check --update-lock, then read each now: line',
    },
  ]
