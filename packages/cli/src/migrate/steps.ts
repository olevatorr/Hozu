import type { Json } from '@hozu/core/ir'
import type { Note } from './ast.ts'
import { addRuns, addRunsServer, normalize010 } from './step-0.11.ts'
import { ignoreHozu } from './step-0.12.ts'
import { rewriteScripts } from './step-0.14.ts'
import { accessStep, normalize014Renamed } from './step-0.15.ts'

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
      'connect: [] on every feature and env files / internal in the IR (ADR 0051, 0052); new warnings HZ083 and HZ084',
    rewrite: (_file, source) => ({ code: source, notes: [], count: 0 }),
    normalize: (ir) => {
      const features = (ir as { features?: Record<string, Record<string, unknown>> }).features ?? {}
      for (const f of Object.values(features)) f.connect ??= []
      const env = (ir as { env?: Record<string, unknown> | null }).env
      if (env) {
        env.files ??= []
        env.internal ??= {}
      }
      return ir
    },
  },
  {
    from: '0.13',
    to: '0.14',
    summary:
      "runs: 'either' where runs is omitted (0.14 requires it); package.json scripts call hozu check, and hozu graph scripts are removed (ADR 0053)",
    rewrite: (file, source) => addRuns('either', file, source),
    normalize: (ir) => {
      ;(ir as { accept?: unknown[] }).accept ??= []
      return ir
    },
    files: rewriteScripts,
  },
  {
    from: '0.14',
    to: '0.15',
    summary:
      "access: 'anyone' on every server-run user query and mutation, the 0.14 behaviour (ADR 0056 B); HZ090 then lists the user queries to tighten; an error the app named Forbidden (the framework's access error since 0.15) becomes NotAllowed",
    rewrite: accessStep,
    normalize: normalize014Renamed,
  },
  {
    from: '0.15',
    to: '0.16',
    summary:
      'no source change; an app without machines now locks its pages, so run hozu check --update-lock if it says the lock is missing; an endpoint at /sitemap.xml, /robots.txt or (with a site) /manifest.webmanifest is now HZ046, and a head.render field Hozu does not know is HZ014: move them to entries, noindex or site (ADR 0057)',
    rewrite: (_, source) => ({ code: source, notes: [], count: 0 }),
    normalize: (ir) => ir,
  },
  {
    from: '0.16',
    to: '0.17',
    summary:
      'no source change; DevTools follows Figma (Shift+Enter selects the parent, Alt measures), and feature({ styles }) must be a list (HZ014) (ADR 0058)',
    rewrite: (_, source) => ({ code: source, notes: [], count: 0 }),
    normalize: (ir) => ir,
  },
  {
    from: '0.17',
    to: '0.18',
    summary:
      'no source change; a page whose head query fails is titled with the site name, app({ refreshSession }) can renew a session while reading, hozu browse --viewport, and DevTools in your language (--devtools-messages) (ADR 0060)',
    rewrite: (_, source) => ({ code: source, notes: [], count: 0 }),
    normalize: (ir) => ir,
  },
  {
    from: '0.18',
    to: '0.19',
    summary:
      "no source change; freshness: { poll: seconds } re-reads a query on a timer, target: 'previous' returns to the state a machine came from, a field alone is a guard, and hozu browse says per step what changed (hold / release keep an effect pending) (ADR 0063)",
    rewrite: (_, source) => ({ code: source, notes: [], count: 0 }),
    normalize: (ir) => ir,
  },
  {
    from: '0.19',
    to: '0.20',
    summary:
      "no source change; transitions take refresh: () => [tag()] and copy, a render gets is([...]), HZ036 no longer warns about a form that starts a runs: 'browser' mutation (delete such accept entries, HZ087), hozu browse runs with JavaScript by default, and an on without target stays without entering its state again (accept the lock with hozu check --update-lock if HZ057 lists --> stays) (ADR 0064)",
    rewrite: (_, source) => ({ code: source, notes: [], count: 0 }),
    normalize: (ir) => ir,
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
