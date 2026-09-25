import { type JsonPatchOp, parsePointer } from '@tenon/core/ir'

export function applyPatch<T>(doc: T, ops: JsonPatchOp[]): T {
  const out = structuredClone(doc) as unknown
  for (const op of ops) {
    const tokens = parsePointer(op.path)
    const last = tokens.pop()!
    let parent = out as Record<string, unknown> | unknown[]
    for (const t of tokens) parent = (parent as Record<string, unknown>)[t] as Record<string, unknown>
    if (Array.isArray(parent)) {
      const index = last === '-' ? parent.length : Number(last)
      if (op.op === 'add') parent.splice(index, 0, structuredClone(op.value))
      else if (op.op === 'replace') parent[index] = structuredClone(op.value)
      else parent.splice(index, 1)
    } else if (op.op === 'remove') delete parent[last]
    else parent[last] = structuredClone(op.value)
  }
  return out as T
}
