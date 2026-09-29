const signedInPages = new Set(['/'])

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (signedInPages.has(path) && !currentUser(event)) return sendRedirect(event, '/login', 302)
})
