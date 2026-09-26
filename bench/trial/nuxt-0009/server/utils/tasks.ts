export const PRIORITIES = ['low', 'normal', 'high'] as const
export type Priority = (typeof PRIORITIES)[number]

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value)
}

export interface Task {
  id: string
  title: string
  done: boolean
  priority: Priority
}

const tasks: Task[] = [
  { id: 't1', title: 'Write the spec', done: true, priority: 'normal' },
  { id: 't2', title: 'Build the app', done: false, priority: 'normal' },
  { id: 't3', title: 'Ship it', done: false, priority: 'normal' },
]

let nextId = 4

export function listTasks(): Task[] {
  return tasks
}

export function findTask(id: string): Task | undefined {
  return tasks.find((t) => t.id === id)
}

export function addTask(title: string, priority: Priority = 'normal'): Task {
  let id = `t${nextId++}`
  while (findTask(id)) id = `t${nextId++}`
  const task: Task = { id, title, done: false, priority }
  tasks.unshift(task)
  return task
}

export function clearDone(): number {
  let removed = 0
  for (let i = tasks.length - 1; i >= 0; i--) {
    if (tasks[i]!.done) {
      tasks.splice(i, 1)
      removed++
    }
  }
  return removed
}
