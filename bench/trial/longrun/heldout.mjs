import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function loadHeldout(file, { checks, check, helpers }) {
  if (!file) return null
  const path = resolve(file)
  const mod = await import(pathToFileURL(path).href)
  const earlier = new Map(checks.map((c) => [c.id, c]))
  const from = checks.length
  await mod.default({ check, ...helpers })
  const added = checks.slice(from)
  const ids = new Set(earlier.keys())
  for (const c of added) {
    if (!/^X/.test(c.id)) throw new Error(`held-out check id ${c.id} must start with X`)
    if (ids.has(c.id)) throw new Error(`held-out check id ${c.id} is not unique`)
    ids.add(c.id)
  }
  const retires = mod.retires ?? {}
  for (const [id, at] of Object.entries(retires)) {
    const c = earlier.get(id)
    if (!c) throw new Error(`retires names ${id}, which is not an earlier check`)
    if (!Number.isInteger(at)) throw new Error(`retires.${id} must be a step number`)
    c.until = Math.min(c.until, at)
  }
  return {
    path,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    added: added.map((c) => c.id),
    retires,
  }
}
