import { addNote, clearNotes, labelOf, listNotes, removeNote } from '@hozu/devtools'
import type { ShowOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { runLocate } from './locate.ts'

export interface ShowOptions {
  note: string | undefined
  page: string | undefined
  done: string | undefined
  clear: boolean
}

export function runShow(
  loaded: Loaded | null,
  root: string,
  target: string | undefined,
  o: ShowOptions,
): ShowOutput {
  if (o.clear) return { added: null, removed: clearNotes(root), notes: [] }
  if (o.done !== undefined) {
    const n = Number(o.done)
    try {
      removeNote(root, n)
    } catch {
      throw new HozuCliError('usage', `No note ${o.done}`, ['hozu show   # lists the notes'])
    }
    return { added: null, removed: 1, notes: listNotes(root) }
  }
  if (!target) {
    if (o.note !== undefined)
      throw new HozuCliError('usage', 'hozu show needs the part to show the note on', [
        'hozu show notes.NotesBoard/0/1 --note "This button now asks before it deletes"',
        'hozu show page:home --note "The page title changed"',
      ])
    return { added: null, removed: 0, notes: listNotes(root) }
  }
  if (!o.note?.trim())
    throw new HozuCliError('usage', 'hozu show needs --note: what the person should see there', [
      `hozu show ${target} --note "<what changed, in the person's words>"`,
    ])
  if (o.page !== undefined && !o.page.startsWith('/'))
    throw new HozuCliError('usage', '--page takes a path such as /notes', [])
  const node = runLocate(loaded!, target)
  const owner = node.owner ? ` in ${node.owner.feature}.${node.owner.view}` : ''
  const path = o.page ?? (node.page && !node.page.path.includes(':') ? node.page.path : null)
  const added = addNote(root, {
    id: node.id,
    label: `${labelOf(node)}${owner}`,
    at: node.location ? `${node.location.file}:${node.location.line}` : null,
    path,
    text: o.note.trim(),
  })
  return { added, removed: 0, notes: listNotes(root) }
}

export function describeShow(out: ShowOutput): string {
  const lines: string[] = []
  if (out.added) lines.push(`note ${out.added.n} added: hozu dev shows it on the page`)
  if (out.removed) lines.push(`${out.removed} note${out.removed === 1 ? '' : 's'} removed`)
  if (!out.notes.length) lines.push('no notes on the page')
  for (const n of out.notes)
    lines.push(
      `${n.n}  ${n.label}${n.at ? `  ${n.at}` : ''}${n.path ? `  on ${n.path}` : ''}`,
      `   ${n.text}`,
    )
  return `${lines.join('\n')}\n`
}
