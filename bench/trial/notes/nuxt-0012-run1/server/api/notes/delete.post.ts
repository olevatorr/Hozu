export default defineEventHandler(async (event) => {
  const form = isFormPost(event)
  const user = currentUser(event)
  if (!user) {
    if (form) return sendRedirect(event, '/login', 303)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  }
  const body = await readBody<{ id?: unknown }>(event)
  const notes = getNotes(user)
  const index = notes.findIndex((n) => n.id === body?.id)
  if (index !== -1) notes.splice(index, 1)
  if (form) return sendRedirect(event, '/', 303)
  return { ok: true }
})
