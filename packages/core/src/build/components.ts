import type { Fix } from '../ir/diagnostic.ts'

export const notYet = (what: string): [message: string, cause: string, fix: Fix] => [
  `${what} is not supported until ADR 0045 phase 2`,
  'Phase 1 of 0.9 declares the component types only; the build records components and kits from phase 2 (docs/adr/0045-0-9-ui-components.md).',
  {
    summary: 'Keep this view as ui elements, a part() or a ui.widget until phase 2',
    snippet: null,
    patch: null,
  },
]
