export default defineEventHandler((event) => ({ user: currentUser(event) ?? null, flash: takeFlash(event) }))
