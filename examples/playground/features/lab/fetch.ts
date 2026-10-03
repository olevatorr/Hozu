import { implement } from '@hozu/core/fetch'
import type * as model from './model.ts'

const KEY = 'playground:drafts'

type Draft = { id: string; text: string; at: string }

function stored(): Draft[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export const posts = implement<typeof model.posts>(async ({ userId }, { fail, signal, env }) => {
  const r = await fetch(`${env.POSTS_API}/posts?userId=${userId}`, { signal })
  return r.ok ? (await r.json()).slice(0, 5) : fail('Unavailable', { status: r.status })
})

export const createPost = implement<typeof model.createPost>(
  async ({ userId, title }, { fail, signal, env }) => {
    const r = await fetch(`${env.POSTS_API}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: Number(userId), title, body: '' }),
      signal,
    })
    return r.ok ? r.json() : fail('Unavailable', { status: r.status })
  },
)

export const drafts = implement<typeof model.drafts>(async () => stored())

export const saveDraft = implement<typeof model.saveDraft>(async ({ text }) => {
  const draft = { id: crypto.randomUUID(), text, at: new Date().toISOString() }
  localStorage.setItem(KEY, JSON.stringify([draft, ...stored()]))
  return draft
})

export const clearDrafts = implement<typeof model.clearDrafts>(async () => {
  const removed = stored().length
  localStorage.removeItem(KEY)
  return { removed }
})
