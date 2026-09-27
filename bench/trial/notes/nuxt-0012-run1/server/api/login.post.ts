export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: unknown }>(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const form = isFormPost(event)
  if (!isValidName(name)) {
    if (form) return sendRedirect(event, '/login?error=invalid', 303)
    throw createError({ statusCode: 400, statusMessage: 'Invalid name' })
  }
  signIn(event, name)
  if (form) return sendRedirect(event, '/', 303)
  return { name }
})
