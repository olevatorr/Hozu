import { PRIORITIES, type Priority, type Task } from '#shared/types/task'

const tasks: Task[] = [
  { id: 't1', title: 'Write the spec', done: true, priority: 'normal' },
  { id: 't2', title: 'Build the app', done: false, priority: 'normal' },
  { id: 't3', title: 'Ship it', done: false, priority: 'normal' },
]
let seq = 3

export const TITLE_MIN = 3
export const TITLE_MAX = 80

export function listTasks(): Task[] {
  return [...tasks]
}

export function findTask(id: string): Task | undefined {
  return tasks.find((t) => t.id === id)
}

export type AddResult = { ok: true; task: Task } | { ok: false; error: 'invalid' | 'duplicate' }

export function addTask(raw: unknown, rawPriority?: unknown): AddResult {
  const priority: Priority =
    rawPriority === undefined || rawPriority === '' ? 'normal' : (rawPriority as Priority)
  if (!PRIORITIES.includes(priority)) return { ok: false, error: 'invalid' }
  const title = typeof raw === 'string' ? raw.trim() : ''
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) return { ok: false, error: 'invalid' }
  const key = title.toLowerCase()
  if (tasks.some((t) => t.title.toLowerCase() === key)) return { ok: false, error: 'duplicate' }
  seq += 1
  const task: Task = { id: `t${seq}`, title, done: false, priority }
  tasks.unshift(task)
  return { ok: true, task }
}

export function toggleTask(id: string): Task | undefined {
  const task = findTask(id)
  if (task) task.done = !task.done
  return task
}

export function clearDone(): string[] {
  const removed = tasks.filter((t) => t.done).map((t) => t.id)
  for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i]!.done) tasks.splice(i, 1)
  return removed
}
