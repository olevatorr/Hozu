import { finishRequest, listRequests } from '@hozu/devtools'
import type { RequestsOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'

export function runRequests(
  cwd: string,
  action: string | undefined,
  number: string | undefined,
  result: string | undefined,
): RequestsOutput {
  if (action === 'done') {
    if (!number || !result?.trim())
      throw new HozuCliError('usage', 'hozu requests done needs the request number and --result', [
        'hozu requests done 0001 --result "h1 is text-4xl now"',
      ])
    try {
      finishRequest(cwd, number, result.trim())
    } catch (e) {
      throw new HozuCliError('usage', (e as Error).message, ['hozu requests   # lists the numbers'])
    }
  } else if (action !== undefined)
    throw new HozuCliError('usage', `Unknown requests action "${action}"`, [
      'hozu requests',
      'hozu requests done <n> --result "<what changed>"',
    ])
  const requests = listRequests(cwd).sort((a, b) =>
    a.status === b.status ? a.number.localeCompare(b.number) : a.status === 'done' ? -1 : 1,
  )
  return { requests, done: action === 'done' ? (number ?? '').padStart(4, '0') : null }
}

export function describeRequests(out: RequestsOutput): string {
  if (!out.requests.length)
    return 'No requests yet. Run hozu dev, choose Select in the Hozu DevTools dock, click what should change, describe it and press Save request.\n'
  const lines: string[] = []
  if (out.done) {
    const r = out.requests.find((x) => x.number === out.done)
    lines.push(`${out.done} done: ${r?.result ?? ''}`, '')
  }
  for (const r of out.requests)
    lines.push(
      `${r.number}  ${r.status.padEnd(4)}  ${r.title}${r.locations.length ? `  ${r.locations.join(', ')}` : ''}`,
    )
  const open = out.requests.filter((r) => r.status === 'open')
  lines.push('', `${open.length} open · read one with: cat ${open[0]?.file ?? '.hozu/requests/<file>'}`)
  return `${lines.join('\n')}\n`
}
