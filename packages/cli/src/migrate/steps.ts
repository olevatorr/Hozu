import type { Json } from '@hozu/core/ir'
import type { Note } from './ast.ts'
import { addRunsServer, normalize010 } from './step-0.11.ts'
import { ignoreHozu } from './step-0.12.ts'

export interface Step {
  from: string
  to: string
  /** What the step changes, in one line for the plan. */
  summary: string
  rewrite(file: string, source: string): { code: string; notes: Note[]; count: number }
  /** The IR of `from` in `to` terms: every difference left after it is a behaviour change to review. */
  normalize(ir: Json): Json
  /** Changes to files other than sources (`.gitignore`), relative to the app directory. */
  files?(dir: string, write: boolean): { file: string; edits: number }[]
}

/** One step per release from 0.11 on (ADR 0049 §6); 0.10.0 is the oldest supported starting point. */
export const steps: Step[] = [
  {
    from: '0.10',
    to: '0.11',
    summary: "runs: 'server' on every query and mutation without runs (0.11 defaults to 'either')",
    rewrite: addRunsServer,
    normalize: normalize010,
  },
  {
    from: '0.11',
    to: '0.12',
    summary: '.hozu/ in .gitignore (0.12 caches the transform and the type check there)',
    rewrite: (_file, source) => ({ code: source, notes: [], count: 0 }),
    normalize: (ir) => ir,
    files: ignoreHozu,
  },
  {
    from: '0.12',
    to: '0.13',
    summary:
      'connect: [] on every feature in the IR (ADR 0051); hozu check warns (HZ083) about undeclared origins',
    rewrite: (_file, source) => ({ code: source, notes: [], count: 0 }),
    normalize: (ir) => {
      const features = (ir as { features?: Record<string, Record<string, unknown>> }).features ?? {}
      for (const f of Object.values(features)) f.connect ??= []
      return ir
    },
  },
]

export const OLDEST = steps[0]!.from

export const minorOf = (version: string): string => version.split('.').slice(0, 2).join('.')

const rank = (minor: string) => minor.split('.').map(Number) as [number, number]

export const compareMinor = (a: string, b: string): number => {
  const [a0, a1] = rank(a)
  const [b0, b1] = rank(b)
  return a0 - b0 || a1 - b1
}

/** The steps that take `from` to `to`, in order; null when there is no path. */
export function chain(from: string, to: string): Step[] | null {
  const out: Step[] = []
  let at = from
  while (compareMinor(at, to) < 0) {
    const next = steps.find((s) => s.from === at)
    if (!next) return null
    out.push(next)
    at = next.to
  }
  return out
}
