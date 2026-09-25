export default defineEventHandler((event) => {
  const task = toggleTask(getRouterParam(event, 'id') ?? '')
  if (!task) throw createError({ statusCode: 404, message: 'Task not found' })
  return task
})
