import { dirname, relative } from 'node:path'
import { closest } from '@hozu/validator'
import type { WhyOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { describeComponentImpact } from './components.ts'
import { describeExplain, runExplain } from './explain.ts'
import { describeImpact, runImpact } from './impact.ts'
import { describeLocate, runLocate } from './locate.ts'

const KINDS = ['queries', 'mutations', 'endpoints', 'events', 'tags', 'fns', 'views']

function sourceOf(loaded: Loaded, pointers: string[], prefix: string | null): string | null {
  const sources = loaded.build(true).sources
  const root = dirname(loaded.path)
  const found =
    pointers.map((p) => sources[p]).find(Boolean) ??
    (prefix ? Object.entries(sources).find(([p]) => p.startsWith(prefix))?.[1] : undefined)
  return found ? `${relative(root, found.file)}:${found.line}` : null
}

/** One answer for a declaration, a component, a state, a view node or a page (ADR 0053 F). */
export function runWhy(loaded: Loaded, target: string | undefined, cwd: string): WhyOutput {
  if (!target)
    throw new HozuCliError('usage', 'Give a declaration, component, state, view node or page', [
      'hozu why cart.addItem',
      'hozu why cart.idle',
      'hozu why ui.Button',
      'hozu why notes.NotesBoard/0/1',
      'hozu why page:home',
    ])
  if (target.startsWith('page:') || target.includes('/')) {
    const node = runLocate(loaded, target)
    const at = node.location ? `${node.location.file}:${node.location.line}` : null
    return { target, kind: target.startsWith('page:') ? 'page' : 'node', at, node }
  }
  const dot = target.indexOf('.')
  const [owner, name] = [target.slice(0, dot), target.slice(dot + 1)]
  if (dot > 0 && loaded.build().ir.features[owner]?.machine?.states[name]) {
    const state = runExplain(loaded, target)
    const at = sourceOf(loaded, [], `/features/${owner}/machine/states/${name}/`)
    return { target, kind: 'state', at: at ?? sourceOf(loaded, [`/features/${owner}/machine`], null), state }
  }
  const impact = (() => {
    try {
      return runImpact(loaded, target, cwd)
    } catch (error) {
      const states = Object.keys(loaded.build().ir.features[owner]?.machine?.states ?? {})
      if (!(error instanceof HozuCliError) || dot <= 0) throw error
      const state = closest(name, states)
      if (state) throw new HozuCliError('unknown-feature', error.message, [`${owner}.${state}`])
      throw error
    }
  })()
  const pointers =
    impact.kind === 'component'
      ? [`/kits/${owner}/components/${name}`, `/features/${owner}/components/${name}`]
      : KINDS.map((k) => `/features/${owner}/${k}/${name}`)
  return {
    target,
    kind: impact.kind === 'component' ? 'component' : 'declaration',
    at: sourceOf(loaded, pointers, null),
    impact,
  }
}

export function describeWhy(out: WhyOutput): string {
  const head = `${out.target}  ${out.kind}${out.at ? `  at ${out.at}` : ''}`
  const body =
    'state' in out
      ? describeExplain(out.state)
      : 'node' in out
        ? describeLocate(out.node)
        : out.impact.kind === 'component'
          ? describeComponentImpact(out.impact)
          : describeImpact(out.impact)
  return `${head}\n${body}${body.endsWith('\n') ? '' : '\n'}`
}
