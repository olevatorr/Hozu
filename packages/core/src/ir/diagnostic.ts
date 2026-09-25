import type { Json } from './types.ts'

export type Severity = 'error' | 'warning'

export type DiagnosticCode =
  | 'TN001'
  | 'TN002'
  | 'TN003'
  | 'TN004'
  | 'TN005'
  | 'TN006'
  | 'TN007'
  | 'TN008'
  | 'TN009'
  | 'TN010'
  | 'TN011'
  | 'TN012'
  | 'TN013'
  | 'TN014'
  | 'TN015'
  | 'TN016'
  | 'TN017'
  | 'TN018'

export interface SourceLoc {
  file: string
  line: number
  column: number
}

export type SourceIndex = Record<string, SourceLoc>

export type JsonPatchOp =
  | { op: 'add' | 'replace'; path: string; value: Json }
  | { op: 'remove'; path: string }

export interface Fix {
  summary: string
  snippet: string | null
  patch: JsonPatchOp[] | null
}

export interface Location {
  feature: string | null
  pointer: string
  source: SourceLoc | null
}

export interface Diagnostic {
  code: DiagnosticCode
  severity: Severity
  message: string
  location: Location
  cause: string
  fix: Fix | null
}
