export default defineEventHandler((event) => {
  const task = findTask(getRouterParam(event, 'id') ?? '')
  if (!task) throw createError({ statusCode: 404, message: 'Task not found' })
  return task
})
