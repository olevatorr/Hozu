import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { locateNode } from '@hozu/core/ir'
import type { LocateOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'

export function runLocate(loaded: Loaded, target: string | undefined): LocateOutput {
  if (!target)
    throw new HozuCliError('usage', 'Give a node id or IR pointer', [
      'hozu locate notes.NotesBoard/0/1',
      'hozu locate /features/notes/views/NotesBoard/root/children/0',
    ])
  const root = dirname(loaded.path)
  const found = locateNode(loaded.build(true), target, { root })
  if (!found)
    throw new HozuCliError('usage', `No view node ${target}`, [
      'Copy the id from a Hozu DevTools request, or the data-hz attribute under hozu dev',
    ])
  if (!found.location) return found
  try {
    const lines = readFileSync(join(root, found.location.file), 'utf8').split('\n')
    const start = Math.max(1, found.location.line - 3)
    return { ...found, excerpt: { start, lines: lines.slice(start - 1, start + 6) } }
  } catch {
    return found
  }
}

export function describeLocate(n: LocateOutput): string {
  const at = (l: { file: string; line: number; column: number } | null) =>
    l ? `${l.file}:${l.line}:${l.column}` : '?'
  const lines = [
    `${n.id}  ${n.kind}${n.tag ? ` <${n.tag}>` : ''}${n.component ? ` · ${n.component.ref}` : ''}`,
    `  at    ${at(n.location)}`,
  ]
  if (n.component) lines.push(`  decl  ${at(n.component.declaration)}`)
  for (const c of n.conditions) lines.push(`  when  ${c.kind}: ${c.detail}`)
  for (const e of n.events)
    lines.push(`  on    ${e.dom} → ${e.event}${n.machine ? `  (machine ${at(n.machine)})` : ''}`)
  if (n.text !== null) lines.push(`  text  ${n.text}`)
  if (n.excerpt)
    n.excerpt.lines.forEach((line, i) =>
      lines.push(`  ${String(n.excerpt!.start + i).padStart(4)} | ${line}`),
    )
  return lines.join('\n')
}
