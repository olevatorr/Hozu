const tokensIn = (value: unknown, uploads: Map<string, File>, out: string[] = []): string[] => {
  if (typeof value === 'string') {
    if (uploads.has(value)) out.push(value)
  } else if (value && typeof value === 'object')
    for (const v of Object.values(value)) tokensIn(v, uploads, out)
  return out
}

export function encode(json: string, input: unknown, uploads: Map<string, File>): string | FormData {
  const tokens = tokensIn(input, uploads)
  if (!tokens.length) return json
  const form = new FormData()
  form.append('request', json)
  for (const token of tokens) form.append(token, uploads.get(token)!)
  return form
}
