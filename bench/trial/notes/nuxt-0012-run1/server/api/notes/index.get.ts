export default defineEventHandler((event) => {
  const user = currentUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  return { user, notes: sortNotes(getNotes(user)) }
})
