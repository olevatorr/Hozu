export const priorities = ['low', 'normal', 'high'] as const

export type Priority = (typeof priorities)[number]

export interface Task {
  id: string
  title: string
  done: boolean
  priority: Priority
}
