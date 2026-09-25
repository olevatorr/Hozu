export default defineEventHandler((event) => {
  const task = toggleTask(getRouterParam(event, 'id') ?? '')
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  const isForm = (getRequestHeader(event, 'content-type') ?? '').includes('application/x-www-form-urlencoded')
  if (isForm) return sendRedirect(event, '/', 303)
  return task
})
