import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** A note the agent shows the person on the page (ADR 0056 D). */
export interface AgentNote {
  n: number
  /** The DevTools node id the note frames (`notes.Board/0/1`), or `page:<route>`. */
  id: string
  /** What the note names, as `hozu why` describes it. */
  label: string
  /** The source of the target, `file:line`. */
  at: string | null
  /** A page path where the target is shown, when one is known. */
  path: string | null
  text: string
  created: string
}

interface Store {
  next: number
  notes: AgentNote[]
}

export const notesFile = '.hozu/notes.json'

function load(root: string): Store {
  const file = join(root, notesFile)
  if (!existsSync(file)) return { next: 1, notes: [] }
  try {
    const store = JSON.parse(readFileSync(file, 'utf8')) as Store
    return Array.isArray(store.notes) && typeof store.next === 'number' ? store : { next: 1, notes: [] }
  } catch {
    return { next: 1, notes: [] }
  }
}

function store(root: string, value: Store) {
  mkdirSync(join(root, '.hozu'), { recursive: true })
  const file = join(root, notesFile)
  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(`${file}.tmp`, file)
}

export const listNotes = (root: string): AgentNote[] => load(root).notes

export function addNote(root: string, note: Omit<AgentNote, 'n' | 'created'>, now = new Date()): AgentNote {
  const current = load(root)
  const added = { n: current.next, ...note, created: now.toISOString() }
  store(root, { next: current.next + 1, notes: [...current.notes, added] })
  return added
}

export function removeNote(root: string, n: number): AgentNote {
  const current = load(root)
  const found = current.notes.find((note) => note.n === n)
  if (!found) throw new Error(`No note ${n}`)
  store(root, { ...current, notes: current.notes.filter((note) => note.n !== n) })
  return found
}

export function clearNotes(root: string): number {
  const current = load(root)
  store(root, { next: 1, notes: [] })
  return current.notes.length
}

/** The request a reply to a note becomes: `hozu requests` lists it next to the person's own requests. */
export function replyMarkdown(note: AgentNote, reply: string): string {
  return [
    `# Hozu request: Reply to note ${note.n}`,
    '',
    `## 1. ${note.label}`,
    '',
    `- Note: ${note.text}`,
    note.at ? `- Where: \`${note.at}:1\`` : `- Where: ${note.id}`,
    ...(note.path ? [`- Page: ${note.path}`] : []),
    `- Reply: ${reply}`,
    '',
    `The note stays on the page until \`hozu show --done ${note.n}\` removes it.`,
    '',
  ].join('\n')
}
