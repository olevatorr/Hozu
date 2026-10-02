import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { finishRequest, listRequests, saveRequest } from '../src/requests.ts'

const md = (title: string) =>
  `# Hozu request: ${title}\n\nbody\n\n\`\`\`hozu-request\n${JSON.stringify({ version: 1, title, items: [{ location: { file: 'features/a/views.ts', line: 3, column: 1 } }] })}\n\`\`\`\n`

describe('saved requests (ADR 0047 D2)', () => {
  it('numbers files in order, slugs the title and lists them open', () => {
    const root = mkdtempSync(join(tmpdir(), 'hozu-requests-'))
    const now = new Date('2026-10-02T10:00:00Z')
    expect(saveRequest(root, md('Make the button bigger!'), now)).toEqual({
      number: '0001',
      file: '.hozu/requests/0001-make-the-button-bigger.md',
    })
    expect(saveRequest(root, md('Ünïcode / ok'), now).file).toBe('.hozu/requests/0002-unicode-ok.md')
    const text = readFileSync(join(root, '.hozu/requests/0001-make-the-button-bigger.md'), 'utf8')
    expect(text).toMatch(/^---\nstatus: open\ncreated: 2026-10-02T10:00:00.000Z\n---\n# Hozu request/)
    expect(text).toContain('hozu requests done 0001 --result')
    expect(listRequests(root)).toEqual([
      {
        number: '0001',
        file: '.hozu/requests/0001-make-the-button-bigger.md',
        title: 'Make the button bigger!',
        status: 'open',
        created: '2026-10-02T10:00:00.000Z',
        result: null,
        locations: ['features/a/views.ts:3'],
      },
      expect.objectContaining({ number: '0002', status: 'open' }),
    ])
  })

  it('marks a request done with its result, and refuses an unknown number', () => {
    const root = mkdtempSync(join(tmpdir(), 'hozu-requests-'))
    saveRequest(root, md('One'), new Date('2026-10-02T10:00:00Z'))
    finishRequest(root, '1', 'Added text-2xl to the button', new Date('2026-10-02T11:00:00Z'))
    expect(listRequests(root)[0]).toMatchObject({ status: 'done', result: 'Added text-2xl to the button' })
    expect(readFileSync(join(root, '.hozu/requests/0001-one.md'), 'utf8')).toMatch(
      /^---\nstatus: done\ncreated: 2026-10-02T10:00:00.000Z\ndone: 2026-10-02T11:00:00.000Z\nresult: "Added text-2xl to the button"\n---\n/,
    )
    expect(() => finishRequest(root, '0009', 'x')).toThrow('No request 0009')
  })

  it('an empty project has no requests', () => {
    expect(listRequests(mkdtempSync(join(tmpdir(), 'hozu-requests-')))).toEqual([])
  })
})
