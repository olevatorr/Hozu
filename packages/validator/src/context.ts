import {
  type At,
  codes,
  type Diagnostic,
  type DiagnosticCode,
  type Fix,
  type ProjectIR,
  resolveAt,
  resolveSource,
  type SourceIndex,
} from '@tenon/core/ir'

export class Ctx {
  readonly ir: ProjectIR
  readonly sources: SourceIndex
  readonly diagnostics: Diagnostic[] = []
  readonly unknownClasses: Map<string, string | null> | null

  constructor(ir: ProjectIR, sources: SourceIndex, unknownClasses: Map<string, string | null> | null = null) {
    this.ir = ir
    this.sources = sources
    this.unknownClasses = unknownClasses
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
