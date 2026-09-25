const messages = {
  invalid: 'Title must be 3–80 characters and priority low, normal or high',
  duplicate: 'A task with this title already exists',
} as const

export default defineEventHandler(async (event) => {
  const isForm = (getRequestHeader(event, 'content-type') ?? '').includes('application/x-www-form-urlencoded')
  const body = isForm
    ? Object.fromEntries(new URLSearchParams((await readRawBody(event)) ?? ''))
    : await readBody<{ title?: unknown; priority?: unknown }>(event)
  const result = addTask(body?.title, body?.priority)
  if (isForm) return sendRedirect(event, result.ok ? '/' : `/?error=${result.error}`, 303)
  if (!result.ok) {
    throw createError({
      statusCode: result.error === 'duplicate' ? 409 : 400,
      statusMessage: messages[result.error],
      data: { error: result.error },
    })
  }
  setResponseStatus(event, 201)
  return result.task
})
