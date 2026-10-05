import type { SourceLoc } from '../ir/diagnostic.ts'
import { fileUrlToPath } from '../platform.ts'

const coreUrl = typeof import.meta.url === 'string' ? new URL('../', import.meta.url).href : null
const corePath = coreUrl?.startsWith('file:') ? fileUrlToPath(coreUrl) : coreUrl

type CallSite = {
  getFileName(): string | null
  getLineNumber(): number | null
  getColumnNumber(): number | null
}

const prepare = (_: Error, sites: CallSite[]) => sites
const paths = new Map<string, string>()

const toPath = (raw: string): string => {
  let path = paths.get(raw)
  if (path === undefined) {
    path = raw.startsWith('file://') ? fileUrlToPath(raw) : raw
    paths.set(raw, path)
  }
  return path
}

const internal = (raw: string) =>
  raw.startsWith('node:') || (!!coreUrl && (raw.startsWith(coreUrl) || raw.startsWith(corePath!)))

let enabled = true

export function withCapture<T>(on: boolean, run: () => T): T {
  const previous = enabled
  enabled = on
  try {
    return run()
  } finally {
    enabled = previous
  }
}

export function captureSource(): SourceLoc | null {
  if (!enabled) return null
  const previous = Error.prepareStackTrace
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = 6
  Error.prepareStackTrace = prepare as typeof Error.prepareStackTrace
  const holder: { stack?: CallSite[] } = {}
  Error.captureStackTrace(holder, captureSource)
  const sites = holder.stack
  Error.prepareStackTrace = previous
  Error.stackTraceLimit = limit
  if (!sites) return null
  for (const site of sites) {
    const raw = site.getFileName()
    if (!raw || internal(raw)) continue
    return { file: toPath(raw), line: site.getLineNumber() ?? 0, column: site.getColumnNumber() ?? 0 }
  }
  return null
}
