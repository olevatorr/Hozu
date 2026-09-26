import type { Task } from '#shared/types/task'

const tasks: Task[] = [
  { id: 't1', title: 'Write the spec', done: true },
  { id: 't2', title: 'Build the app', done: false },
  { id: 't3', title: 'Ship it', done: false },
]

let nextId = 4

export function listTasks(): Task[] {
  return tasks
}

export function findTask(id: string): Task | undefined {
  return tasks.find((task) => task.id === id)
}

export function addTask(title: string): Task {
  const task: Task = { id: `t${nextId++}`, title, done: false }
  tasks.unshift(task)
  return task
}

export function titleExists(title: string): boolean {
  const normalized = title.toLowerCase()
  return tasks.some((task) => task.title.trim().toLowerCase() === normalized)
}
