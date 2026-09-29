export default defineEventHandler(async (event) => {
  const form = (await readBody<FormBody>(event)) ?? {}
  const name = field(form, 'name').trim()
  if (!/^\p{L}{2,20}$/u.test(name)) {
    setFlash(event, 'A name is 2–20 letters')
    return finish(event, '/login')
  }
  ensureSession(event).user = name
  notesOf(name)
  return finish(event, '/')
})
