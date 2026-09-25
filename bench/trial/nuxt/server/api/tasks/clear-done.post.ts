export default defineEventHandler(async (event) => {
  const removed = clearDone()
  const isForm = (getRequestHeader(event, 'content-type') ?? '').includes('application/x-www-form-urlencoded')
  if (isForm) return sendRedirect(event, '/', 303)
  return { removed }
})
