import { priorities, type Priority } from '#shared/types/task'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: unknown; priority?: unknown }>(event)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (title.length < 3 || title.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'Title must be 3-80 characters' })
  }
  const priority = body?.priority ?? 'normal'
  if (!priorities.includes(priority as Priority)) {
    throw createError({ statusCode: 400, statusMessage: 'Priority must be low, normal or high' })
  }
  if (titleExists(title)) {
    throw createError({ statusCode: 409, statusMessage: 'A task with this title already exists' })
  }
  setResponseStatus(event, 201)
  return addTask(title, priority as Priority)
})
