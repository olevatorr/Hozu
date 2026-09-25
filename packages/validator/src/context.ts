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

  constructor(ir: ProjectIR, sources: SourceIndex) {
    this.ir = ir
    this.sources = sources
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
