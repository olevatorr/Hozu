export default defineEventHandler(async (event) => {
  const form = isFormPost(event)
  const user = currentUser(event)
  if (!user) {
    if (form) return sendRedirect(event, '/login', 303)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  }
  const body = await readBody<{ text?: unknown }>(event)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const notes = getNotes(user)

  let error: 'invalid' | 'duplicate' | null = null
  if (text.length < 1 || text.length > 100) error = 'invalid'
  else if (notes.some((n) => n.text.toLowerCase() === text.toLowerCase())) error = 'duplicate'

  if (error) {
    if (form) return sendRedirect(event, `/?error=${error}`, 303)
    throw createError({ statusCode: error === 'duplicate' ? 409 : 400, statusMessage: error })
  }

  const note = { id: crypto.randomUUID(), text }
  notes.unshift(note)
  if (form) return sendRedirect(event, '/', 303)
  return note
})
