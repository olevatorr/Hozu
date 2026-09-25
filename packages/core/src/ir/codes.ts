import type { DiagnosticCode, Severity } from './diagnostic.ts'

export interface CodeInfo {
  name: string
  severity: Severity
}

export const codes: Record<DiagnosticCode, CodeInfo> = {
  TN001: { name: 'unreachable-state', severity: 'error' },
  TN002: { name: 'unhandled-event', severity: 'error' },
  TN003: { name: 'undeclared-effect', severity: 'error' },
  TN004: { name: 'unhandled-declared-error', severity: 'error' },
  TN005: { name: 'illegal-view-event', severity: 'error' },
  TN006: { name: 'boundary-violation', severity: 'error' },
  TN007: { name: 'dangling-reference', severity: 'error' },
  TN008: { name: 'invalid-reference-path', severity: 'error' },
  TN009: { name: 'shadowed-transition', severity: 'error' },
  TN010: { name: 'dead-end-state', severity: 'warning' },
  TN011: { name: 'nondeterministic-build', severity: 'error' },
  TN012: { name: 'schema-adapter-mismatch', severity: 'error' },
  TN013: { name: 'duplicate-declaration', severity: 'error' },
  TN014: { name: 'invalid-builder-output', severity: 'error' },
  TN015: { name: 'contract-failed', severity: 'error' },
  TN016: { name: 'uncovered-transition', severity: 'error' },
  TN017: { name: 'invalid-contract-data', severity: 'error' },
  TN018: { name: 'behavior-changed-without-contract', severity: 'error' },
  TN019: { name: 'ineffective-invalidation', severity: 'warning' },
  TN020: { name: 'user-scope-without-session', severity: 'error' },
  TN021: { name: 'missing-resolver', severity: 'error' },
  TN022: { name: 'user-data-in-cacheable-region', severity: 'error' },
  TN023: { name: 'render-assertion-violated', severity: 'error' },
  TN024: { name: 'route-mismatch', severity: 'error' },
  TN025: { name: 'undiscoverable-page', severity: 'warning' },
  TN026: { name: 'unknown-class', severity: 'error' },
  TN027: { name: 'invalid-dom-field', severity: 'error' },
  TN028: { name: 'image-without-dimensions', severity: 'error' },
  TN029: { name: 'widget-boundary-mismatch', severity: 'error' },
  TN030: { name: 'unsafe-html', severity: 'error' },
  TN031: { name: 'invalid-literal', severity: 'error' },
  TN032: { name: 'untyped-internal-link', severity: 'error' },
  TN033: { name: 'unchecked-dom-text', severity: 'error' },
  TN034: { name: 'conflicting-ignore', severity: 'error' },
}
