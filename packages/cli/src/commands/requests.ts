import { finishRequest, joinRequests, listRequests, readRequest } from '@hozu/devtools'
import type { RequestsOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'

export function runRequests(
  cwd: string,
  action: string | undefined,
  number: string | undefined,
  result: string | undefined,
  full = false,
): RequestsOutput {
  let done: RequestsOutput['done'] = null
  if (action === 'done') {
    if (!number || !result?.trim())
      throw new HozuCliError('usage', 'hozu requests done needs the request number and --result', [
        'hozu requests done 0001 --result "h1 is text-4xl now"',
      ])
    try {
      const closed = finishRequest(cwd, number, result.trim())
      done = { number: closed.number, result: result.trim() }
    } catch (e) {
      throw new HozuCliError('usage', (e as Error).message, ['hozu requests   # lists the numbers'])
    }
  } else if (action !== undefined)
    throw new HozuCliError('usage', `Unknown requests action "${action}"`, [
      'hozu requests',
      'hozu requests done <n> --result "<what changed>"',
    ])
  const requests = listRequests(cwd)
  const prompt =
    full && requests.length ? joinRequests(requests.map((r) => readRequest(cwd, r.number))) : null
  return { requests, done, prompt }
}

export function describeRequests(out: RequestsOutput): string {
  if (out.prompt) return out.prompt
  const lines: string[] = []
  if (out.done) lines.push(`${out.done.number} done and removed: ${out.done.result}`, '')
  if (!out.requests.length)
    lines.push(
      out.done
        ? 'No open requests left.'
        : 'No requests yet. Run hozu dev, choose Select in the Hozu DevTools dock, click what should change, describe it and press Save request.',
    )
  else {
    for (const r of out.requests)
      lines.push(`${r.number}  open  ${r.title}${r.locations.length ? `  ${r.locations.join(', ')}` : ''}`)
    lines.push('', `${out.requests.length} open · all of them as one prompt: hozu requests --full`)
  }
  return `${lines.join('\n')}\n`
}
