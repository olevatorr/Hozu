import { implement } from '@hozu/core/fetch'
import type * as model from './model.ts'

const KEY = 'stars:github-token'

export const searchRepos = implement<typeof model.searchRepos>(async ({ q }, { fail, signal, env }) => {
  if (!q.trim()) return []
  const r = await fetch(`${env.GITHUB_API}/search/repositories?per_page=10&q=${encodeURIComponent(q)}`, {
    signal,
  })
  return r.ok ? (await r.json()).items : fail('Unavailable', { status: r.status })
})

export const starred = implement<typeof model.starred>(async (_, { fail, signal, env }) => {
  const token = localStorage.getItem(KEY)
  if (!token) return fail('Unauthorized', {})
  const r = await fetch(`${env.GITHUB_API}/user/starred?per_page=50`, {
    headers: { authorization: `Bearer ${token}` },
    signal,
  })
  return r.status === 401 ? fail('Unauthorized', {}) : r.json()
})

export const saveToken = implement<typeof model.saveToken>(async ({ token }) => {
  localStorage.setItem(KEY, token.trim())
  return {}
})

/** PUT or DELETE /user/starred/{repo}: the status, or 401 without a token. */
async function starring(method: 'PUT' | 'DELETE', repo: string, signal: AbortSignal, api: unknown) {
  const token = localStorage.getItem(KEY)
  if (!token) return 401
  const r = await fetch(`${api}/user/starred/${repo}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    signal,
  })
  return r.status
}

export const star = implement<typeof model.star>(async ({ repo }, { fail, signal, env }) =>
  (await starring('PUT', repo, signal, env.GITHUB_API)) === 401 ? fail('Unauthorized', {}) : {},
)
export const unstar = implement<typeof model.unstar>(async ({ repo }, { fail, signal, env }) =>
  (await starring('DELETE', repo, signal, env.GITHUB_API)) === 401 ? fail('Unauthorized', {}) : {},
)
