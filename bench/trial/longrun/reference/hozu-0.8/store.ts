export interface Note {
  id: string
  title: string
  pinned: boolean
  archived: boolean
  sharedWith: string[]
  createdAt: string
}

const seeded = (id: string, title: string, createdAt: string): Note => ({
  id,
  title,
  pinned: false,
  archived: false,
  sharedWith: [],
  createdAt,
})

export function createStore() {
  const notes = new Map<string, Note[]>([
    [
      'ada',
      [
        seeded('n1', 'Buy milk', '2026-01-15T09:00:00.000Z'),
        seeded('n2', 'Call Bob', '2026-01-14T09:00:00.000Z'),
      ],
    ],
    ['bob', [seeded('n3', "Bob's secret", '2026-01-10T09:00:00.000Z')]],
  ])
  const deleted = new Map<string, { note: Note; at: number }>()
  const added = new Map<string, number[]>()
  let seq = 3
  const of = (user: string) => {
    const list = notes.get(user) ?? []
    notes.set(user, list)
    return list
  }
  const ordered = (list: Note[]) => [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)]
  return {
    of,
    all: (user: string) => ordered(of(user)),
    active: (user: string) => ordered(of(user).filter((n) => !n.archived)),
    archived: (user: string) => of(user).filter((n) => n.archived),
    find: (user: string, id: string, archived = false) =>
      of(user).find((n) => n.id === id && n.archived === archived),
    taken: (user: string, title: string, except = '') =>
      of(user).some((n) => n.id !== except && n.title.toLowerCase() === title.toLowerCase()),
    sharedWith: (user: string) =>
      [...notes].flatMap(([owner, list]) =>
        list
          .filter((n) => !n.archived && n.sharedWith.includes(user))
          .map((n) => ({ id: n.id, title: n.title, owner })),
      ),
    join: (user: string) => void of(user),
    leave: (user: string) => {
      notes.delete(user)
      deleted.delete(user)
      added.delete(user)
      for (const list of notes.values())
        for (const n of list) n.sharedWith = n.sharedWith.filter((name) => name !== user)
    },
    users: () => [...notes].map(([user, list]) => ({ user, notes: list.length })),
    lastDeleted: (user: string) => deleted.get(user)?.note ?? null,
    forget: (user: string) => deleted.delete(user),
    undo: (user: string) => {
      const last = deleted.get(user)
      if (!last) return null
      of(user).splice(last.at, 0, last.note)
      deleted.delete(user)
      return last.note
    },
    addedSince: (user: string, since: number) => (added.get(user) ?? []).filter((t) => t > since).length,
    add: (user: string, title: string) => {
      added.set(user, [...(added.get(user) ?? []), Date.now()])
      const note = seeded(`n${++seq}`, title, new Date().toISOString())
      of(user).unshift(note)
      return note
    },
    remove: (user: string, id: string, undoable = true) => {
      const list = of(user)
      const at = list.findIndex((n) => n.id === id)
      const [note] = list.splice(at, 1)
      if (note && undoable) deleted.set(user, { note, at })
    },
  }
}
