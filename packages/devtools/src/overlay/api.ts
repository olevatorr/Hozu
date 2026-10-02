import type { DevNode } from '@hozu/core/ir'

export interface SavedSummary {
  number: string
  file: string
  title: string
  status: 'open' | 'done'
  locations: string[]
}

const cache = new Map<string, Promise<DevNode | null>>()

export function node(id: string): Promise<DevNode | null> {
  let found = cache.get(id)
  if (!found) {
    found = fetch(`/_hozu/dev/node?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<DevNode>) : null))
      .catch(() => null)
    cache.set(id, found)
  }
  return found
}

export async function page(path: string): Promise<DevNode | null> {
  try {
    const response = await fetch(`/_hozu/dev/page?path=${encodeURIComponent(path)}`)
    if (!response.ok) return null
    const found = (await response.json()) as DevNode
    cache.set(found.id, Promise.resolve(found))
    return found
  } catch {
    return null
  }
}

export async function save(markdown: string): Promise<{ number: string; file: string }> {
  const response = await fetch('/_hozu/dev/requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function saved(): Promise<SavedSummary[]> {
  try {
    const response = await fetch('/_hozu/dev/requests')
    return response.ok ? response.json() : []
  } catch {
    return []
  }
}

export interface SavedRequest extends SavedSummary {
  markdown: string
  result: string | null
}

const send = async <T>(path: string, method: string, body?: unknown): Promise<T> => {
  const response = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok)
    throw new Error(
      ((await response.json().catch(() => ({}))) as { error?: string }).error ?? response.statusText,
    )
  return response.json() as Promise<T>
}

export const one = (number: string) => send<SavedRequest>(`/_hozu/dev/requests/${number}`, 'GET')
export const remove = (number: string) => send<{ deleted: string }>(`/_hozu/dev/requests/${number}`, 'DELETE')
export const finish = (number: string, result: string) =>
  send<SavedSummary>(`/_hozu/dev/requests/${number}/done`, 'POST', { result })
