import {
  type At,
  type Bindings,
  codes,
  type Diagnostic,
  type DiagnosticCode,
  type Fix,
  type ProjectIR,
  resolveAt,
  resolveSource,
  type SourceIndex,
} from '@tenon/core/ir'
import type { Env } from './env.ts'

export class Ctx {
  readonly ir: ProjectIR
  readonly sources: SourceIndex
  readonly diagnostics: Diagnostic[] = []
  readonly unknownClasses: Map<string, string | null> | null
  readonly assets: Bindings['assets']
  readonly envs = new Map<string, Env>()

  constructor(
    ir: ProjectIR,
    sources: SourceIndex,
    unknownClasses: Map<string, string | null> | null = null,
    assets: Bindings['assets'] = {},
  ) {
    this.ir = ir
    this.sources = sources
    this.unknownClasses = unknownClasses
    this.assets = assets
  }

  report(
    code: DiagnosticCode,
    feature: string | null,
    pointer: At,
    message: string,
    cause: string,
    fix: Fix | null = null,
  ) {
    const p = resolveAt(pointer)
    this.diagnostics.push({
      code,
      severity: codes[code].severity,
      message,
      location: { feature, pointer: p, source: resolveSource(this.sources, p) },
      cause,
      fix,
    })
  }
}
