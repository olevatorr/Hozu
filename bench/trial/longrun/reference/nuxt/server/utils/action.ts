import type { H3Event } from 'h3'
import type { ActionResult } from '#shared/types/note'

export type FormBody = Record<string, string | string[] | undefined>

export const field = (form: FormBody, name: string) => {
  const value = form[name]
  return typeof value === 'string' ? value : ''
}

export function backTo(form: FormBody, fallback = '/'): string {
  const back = field(form, 'back')
  return back.startsWith('/') && !back.startsWith('//') ? back : fallback
}

export function finish(event: H3Event, to: string): ActionResult | Promise<void> {
  if (getRequestHeader(event, 'accept')?.includes('application/json')) return { redirect: to }
  return sendRedirect(event, to, 303)
}

type Action = (ctx: { event: H3Event; form: FormBody; user: string }) => string

export const defineUserAction = (action: Action) =>
  defineEventHandler(async (event) => {
    const user = currentUser(event)
    if (!user) return finish(event, '/login')
    const form = (await readBody<FormBody>(event)) ?? {}
    return finish(event, action({ event, form, user }))
  })
