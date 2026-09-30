import type { Json } from './types.ts'

export type Severity = 'error' | 'warning'

export type DiagnosticCode =
  | 'HZ001'
  | 'HZ002'
  | 'HZ003'
  | 'HZ004'
  | 'HZ005'
  | 'HZ006'
  | 'HZ007'
  | 'HZ008'
  | 'HZ009'
  | 'HZ010'
  | 'HZ011'
  | 'HZ012'
  | 'HZ013'
  | 'HZ014'
  | 'HZ015'
  | 'HZ016'
  | 'HZ017'
  | 'HZ018'
  | 'HZ019'
  | 'HZ020'
  | 'HZ021'
  | 'HZ022'
  | 'HZ023'
  | 'HZ024'
  | 'HZ025'
  | 'HZ026'
  | 'HZ027'
  | 'HZ028'
  | 'HZ029'
  | 'HZ030'
  | 'HZ031'
  | 'HZ032'
  | 'HZ033'
  | 'HZ034'
  | 'HZ035'
  | 'HZ036'
  | 'HZ037'
  | 'HZ038'
  | 'HZ039'
  | 'HZ040'
  | 'HZ041'
  | 'HZ042'
  | 'HZ043'
  | 'HZ044'
  | 'HZ045'
  | 'HZ046'
  | 'HZ047'
  | 'HZ048'
  | 'HZ059'

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
