export default defineEventHandler((event) => {
  const task = findTask(getRouterParam(event, 'id') ?? '')
  if (!task) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  }
  task.done = !task.done
  return task
})
