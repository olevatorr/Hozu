import { PRIORITIES, type Priority } from '#shared/types/task'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: unknown; priority?: unknown }>(event)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (title.length < 3 || title.length > 80) {
    throw createError({ statusCode: 400, message: 'Title must be 3–80 characters' })
  }
  const raw = body?.priority ?? 'normal'
  if (!PRIORITIES.includes(raw as Priority)) {
    throw createError({ statusCode: 400, message: 'Priority must be low, normal or high' })
  }
  const result = addTask(title, raw as Priority)
  if (result === 'duplicate') {
    throw createError({ statusCode: 409, message: 'A task with this title already exists' })
  }
  setResponseStatus(event, 201)
  return result
})
