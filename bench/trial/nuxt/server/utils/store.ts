import type { Priority, Task } from '#shared/types/task'

const tasks: Task[] = [
  { id: 't1', title: 'Write the spec', done: true, priority: 'normal' },
  { id: 't2', title: 'Build the app', done: false, priority: 'normal' },
  { id: 't3', title: 'Ship it', done: false, priority: 'normal' },
]
let seq = 3

export function listTasks(): Task[] {
  return [...tasks].reverse()
}

export function findTask(id: string): Task | undefined {
  return tasks.find((t) => t.id === id)
}

export function addTask(title: string, priority: Priority): Task | 'duplicate' {
  const key = title.toLowerCase()
  if (tasks.some((t) => t.title.toLowerCase() === key)) return 'duplicate'
  seq += 1
  const task: Task = { id: `t${seq}`, title, done: false, priority }
  tasks.push(task)
  return task
}

export function toggleTask(id: string): Task | undefined {
  const task = findTask(id)
  if (task) task.done = !task.done
  return task
}

export function clearDone(): number {
  const before = tasks.length
  for (let i = tasks.length - 1; i >= 0; i--) {
    if (tasks[i]!.done) tasks.splice(i, 1)
  }
  return before - tasks.length
}
