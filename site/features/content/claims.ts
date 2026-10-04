import type { DiagnosticCode } from '@hozu/core/ir'

export interface Claim {
  id: string
  label: string
  value: string
  trial: string
}
export const claims: Claim[] = [
  {
    id: 'cold',
    label: 'Tokens per change against Nuxt, learning Hozu from the guide',
    value: '1.32–1.42×',
    trial: '0024-learning-cost',
  },
  {
    id: 'known',
    label: 'Tokens per change against Nuxt, once Hozu is known',
    value: '1.02–1.06×',
    trial: '0024-learning-cost',
  },
  { id: 'coldCalls', label: 'Tool calls, 8 unseen changes', value: '148 vs 86', trial: '0024-learning-cost' },
  { id: 'passed', label: 'Changes with every check passing', value: '29 of 29', trial: '0024-learning-cost' },
  {
    id: 'nuxtSilent',
    label: 'Changes where Nuxt silently broke a feature',
    value: '3 of 29',
    trial: '0024-learning-cost',
  },
  { id: 'tokens', label: 'Tokens per change, against Nuxt', value: '1.34–1.72×', trial: '0021-0-8-long-run' },
  { id: 'regressions', label: 'Regressions in 16 changes', value: '0', trial: '0021-0-8-long-run' },
  { id: 'silent', label: 'Silent failures in 16 changes', value: '0', trial: '0021-0-8-long-run' },
  { id: 'old', label: 'Regression failures on 0.7, same app', value: '8', trial: '0020-long-run' },
  { id: 'oldSilent', label: 'Steps with silent failures on 0.7', value: '5', trial: '0020-long-run' },
  {
    id: 'oldCost',
    label: 'Tokens per change against Nuxt on 0.7',
    value: '2.64–2.73×',
    trial: '0021-0-8-long-run',
  },
  {
    id: 'js',
    label: 'Client JS on the notes list (Hozu 0.8, Nuxt 4)',
    value: '24.0 KB vs 233.9 KB',
    trial: '0021-0-8-long-run',
  },
]
export interface SpeedRow {
  id: string
  framework: string
  versions: string
  requests: string
  js: string
  interactive: string
}
/** bench/meta (2026-10-04): the same page in each framework's production server, rendered per request. */
export const speed: SpeedRow[] = [
  {
    id: 'hozu',
    framework: 'Hozu 0.15.0',
    versions: 'adapter-node',
    requests: '16,423',
    js: '8.1 KB',
    interactive: '57 ms',
  },
  {
    id: 'sveltekit',
    framework: 'SvelteKit 3.0.0',
    versions: 'Svelte 5.57.1, adapter-node 6.0.0',
    requests: '6,786',
    js: '33.0 KB',
    interactive: '97 ms',
  },
  {
    id: 'nuxt',
    framework: 'Nuxt 4.5.2',
    versions: 'Vue 3.5.43, Nitro 2.13.4',
    requests: '3,058',
    js: '75.8 KB',
    interactive: '91 ms',
  },
  {
    id: 'next',
    framework: 'Next.js 16.3.8',
    versions: 'React 19.3.0, App Router',
    requests: '1,630',
    js: '130.9 KB',
    interactive: '161 ms',
  },
]
export const speedSource = 'https://github.com/olevatorr/Hozu/blob/main/bench/meta/README.md'

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
      code: 'HZ091',
      name: 'rows-outside-owner',
      story: 'Ada’s list showed Bob’s notes.',
      message: 'A query with owner access returned rows the visitor does not own.',
      fix: 'read only the visitor’s rows in the resolver',
    },
    {
      code: 'HZ057',
      name: 'lock-out-of-date',
      story: 'Behaviour changed. Nobody reviewed it.',
      message: 'The lock differs from the computed lock.',
      fix: 'hozu check --update-lock, then read each now: line',
    },
  ]
