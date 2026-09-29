export default defineEventHandler((event) => {
  const session = findSession(event)
  if (session) delete session.user
  return finish(event, '/login')
})
