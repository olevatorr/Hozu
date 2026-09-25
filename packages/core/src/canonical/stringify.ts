const quote = JSON.stringify

export function canonicalStringify(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
      return quote(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`Non-finite number ${value} is not valid JSON`)
      return Object.is(value, -0) ? '0' : String(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
      const obj = value as Record<string, unknown>
      const keys = Object.keys(obj).sort()
      let out = '{'
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!
        const v = obj[key]
        if (v === undefined) throw new TypeError(`Undefined value at key "${key}"`)
        out += `${i ? ',' : ''}${quote(key)}:${canonicalStringify(v)}`
      }
      return `${out}}`
    }
    default:
      throw new TypeError(`Value of type ${typeof value} is not valid JSON`)
  }
}
