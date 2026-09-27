export default defineEventHandler((event) => {
  signOut(event)
  if (isFormPost(event)) return sendRedirect(event, '/login', 303)
  return { ok: true }
})
