export default defineUserAction(({ event, form, user }) => {
  setFlash(event, addNote(user, field(form, 'text')))
  return backTo(form)
})
