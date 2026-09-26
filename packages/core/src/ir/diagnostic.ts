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
  | 'TN019'
  | 'TN020'
  | 'TN021'
  | 'TN022'
  | 'TN023'
  | 'TN024'
  | 'TN025'
  | 'TN026'
  | 'TN027'
  | 'TN028'
  | 'TN029'
  | 'TN030'
  | 'TN031'
  | 'TN032'
  | 'TN033'
  | 'TN034'
  | 'TN035'
  | 'TN036'
  | 'TN037'
  | 'TN038'
  | 'TN039'
  | 'TN040'
  | 'TN041'
  | 'TN042'

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
