export default defineUserAction(({ event, form, user }) => {
  deleteNote(user, getRouterParam(event, 'id') ?? '')
  return backTo(form)
})
