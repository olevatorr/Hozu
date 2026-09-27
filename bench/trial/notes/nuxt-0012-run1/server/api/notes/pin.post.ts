export default defineEventHandler(async (event) => {
  const form = isFormPost(event)
  const user = currentUser(event)
  if (!user) {
    if (form) return sendRedirect(event, '/login', 303)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  }
  const body = await readBody<{ id?: unknown; pinned?: unknown }>(event)
  const pinned = body?.pinned === true || body?.pinned === 'true'
  const note = getNotes(user).find((n) => n.id === body?.id)
  if (note) note.pinned = pinned
  if (form) return sendRedirect(event, '/', 303)
  if (!note) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return note
})
