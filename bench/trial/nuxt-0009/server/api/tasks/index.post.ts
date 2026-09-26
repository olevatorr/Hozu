export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: unknown; priority?: unknown }>(event)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (title.length < 3 || title.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'Title must be 3–80 characters' })
  }
  const priority =
    body?.priority === undefined || body?.priority === null || body?.priority === ''
      ? 'normal'
      : body.priority
  if (!isPriority(priority)) {
    throw createError({ statusCode: 400, statusMessage: 'Priority must be low, normal or high' })
  }
  const lower = title.toLowerCase()
  if (listTasks().some((t) => t.title.toLowerCase() === lower)) {
    throw createError({ statusCode: 409, statusMessage: 'A task with this title already exists' })
  }
  setResponseStatus(event, 201)
  return addTask(title, priority)
})
