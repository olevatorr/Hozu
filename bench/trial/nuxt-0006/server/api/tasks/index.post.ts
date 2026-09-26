export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: unknown }>(event)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (title.length < 3 || title.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'Title must be 3-80 characters' })
  }
  if (titleExists(title)) {
    throw createError({ statusCode: 409, statusMessage: 'A task with this title already exists' })
  }
  setResponseStatus(event, 201)
  return addTask(title)
})
