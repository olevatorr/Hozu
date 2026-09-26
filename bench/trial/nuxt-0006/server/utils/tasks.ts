import type { Priority, Task } from '#shared/types/task'

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
  return tasks.find((task) => task.id === id)
}

export function addTask(title: string, priority: Priority): Task {
  const task: Task = { id: `t${nextId++}`, title, done: false, priority }
  tasks.unshift(task)
  return task
}

export function titleExists(title: string): boolean {
  const normalized = title.toLowerCase()
  return tasks.some((task) => task.title.trim().toLowerCase() === normalized)
}

export function clearDoneTasks(): number {
  const before = tasks.length
  const remaining = tasks.filter((task) => !task.done)
  tasks.splice(0, tasks.length, ...remaining)
  return before - remaining.length
}
