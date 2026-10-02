import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SavedRequest {
  number: string
  file: string
  title: string
  status: 'open' | 'done'
  created: string
  result: string | null
  locations: string[]
}

const folder = '.hozu/requests'

const slug = (title: string) =>
  title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .replace(/-$/, '') || 'request'

const files = (root: string) =>
  existsSync(join(root, folder))
    ? readdirSync(join(root, folder))
        .filter((f) => /^\d{4}-.*\.md$/.test(f))
        .sort()
    : []

const split = (text: string) => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  const head: Record<string, string> = {}
  for (const line of m?.[1]?.split('\n') ?? []) {
    const at = line.indexOf(': ')
    if (at > 0) head[line.slice(0, at)] = line.slice(at + 2)
  }
  return { head, body: m ? text.slice(m[0].length) : text }
}

const front = (head: Record<string, string>) =>
  `---\n${Object.entries(head)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\n`

const titleIn = (body: string) => /^# Hozu request: (.*)$/m.exec(body)?.[1]?.trim() ?? 'Request'

export function saveRequest(
  root: string,
  markdown: string,
  now = new Date(),
): { number: string; file: string } {
  const last = files(root).at(-1)
  const number = String((last ? Number(last.slice(0, 4)) : 0) + 1).padStart(4, '0')
  const file = `${folder}/${number}-${slug(titleIn(markdown))}.md`
  mkdirSync(join(root, folder), { recursive: true })
  const done = `\nWhen done: \`hozu requests done ${number} --result "<one line: what you changed>"\`\n`
  writeFileSync(
    join(root, file),
    `${front({ status: 'open', created: now.toISOString() })}${markdown}${done}`,
    {
      flag: 'wx',
    },
  )
  return { number, file }
}

export function listRequests(root: string): SavedRequest[] {
  return files(root).map((name) => {
    const { head, body } = split(readFileSync(join(root, folder, name), 'utf8'))
    const block = /```hozu-request\n([\s\S]*?)\n```/.exec(body)?.[1]
    let locations: string[] = []
    try {
      const items = (block ? JSON.parse(block).items : []) as {
        location?: { file: string; line: number } | null
      }[]
      locations = items.flatMap((i) => (i.location ? [`${i.location.file}:${i.location.line}`] : []))
    } catch {}
    return {
      number: name.slice(0, 4),
      file: `${folder}/${name}`,
      title: titleIn(body),
      status: head.status === 'done' ? 'done' : 'open',
      created: head.created ?? '',
      result: head.result ? (JSON.parse(head.result) as string) : null,
      locations,
    }
  })
}

export function finishRequest(root: string, number: string, result: string, now = new Date()): SavedRequest {
  const padded = number.padStart(4, '0')
  const name = files(root).find((f) => f.startsWith(`${padded}-`))
  if (!name) throw new Error(`No request ${padded}`)
  const path = join(root, folder, name)
  const { head, body } = split(readFileSync(path, 'utf8'))
  writeFileSync(
    path,
    `${front({ status: 'done', created: head.created ?? '', done: now.toISOString(), result: JSON.stringify(result) })}${body}`,
  )
  return listRequests(root).find((r) => r.number === padded)!
}
