import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  const counter = join(root, folder, '.next')
  const stored = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) || 1 : 1
  const next = Math.max(last ? Number(last.slice(0, 4)) + 1 : 1, stored)
  const number = String(next).padStart(4, '0')
  const file = `${folder}/${number}-${slug(titleIn(markdown))}.md`
  mkdirSync(join(root, folder), { recursive: true })
  const done = `\nWhen done: \`hozu requests done ${number} --result "<one line: what you changed>"\` removes this file.\n`
  writeFileSync(
    join(root, file),
    `${front({ status: 'open', created: now.toISOString() })}${markdown}${done}`,
    {
      flag: 'wx',
    },
  )
  writeFileSync(counter, String(next + 1))
  return { number, file }
}

const summary = (name: string, text: string): SavedRequest => {
  const { head, body } = split(text)
  return {
    number: name.slice(0, 4),
    file: `${folder}/${name}`,
    title: titleIn(body),
    status: head.status === 'done' ? 'done' : 'open',
    created: head.created ?? '',
    result: head.result ? (JSON.parse(head.result) as string) : null,
    locations: [...body.matchAll(/^- Where: `([^`]+):(\d+):\d+`/gm)].map((m) => `${m[1]}:${m[2]}`),
  }
}

const named = (root: string, number: string) => {
  const padded = number.padStart(4, '0')
  const name = files(root).find((f) => f.startsWith(`${padded}-`))
  if (!name) throw new Error(`No request ${padded}`)
  return name
}

export function listRequests(root: string): SavedRequest[] {
  return files(root).map((name) => summary(name, readFileSync(join(root, folder, name), 'utf8')))
}

export function readRequest(root: string, number: string): SavedRequest & { markdown: string } {
  const name = named(root, number)
  const text = readFileSync(join(root, folder, name), 'utf8')
  return { ...summary(name, text), markdown: split(text).body }
}

export function deleteRequest(root: string, number: string): void {
  rmSync(join(root, folder, named(root, number)))
}

export function finishRequest(root: string, number: string, result: string): SavedRequest {
  const name = named(root, number)
  const done = {
    ...summary(name, readFileSync(join(root, folder, name), 'utf8')),
    status: 'done' as const,
    result,
  }
  rmSync(join(root, folder, name))
  return done
}
