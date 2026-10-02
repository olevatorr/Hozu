import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deleteRequest, finishRequest, listRequests, readRequest, saveRequest } from '../src/requests.ts'

const md = (title: string) =>
  `# Hozu request: ${title}\n\n## 1. <h1>\n- Want: x\n- Where: \`features/a/views.ts:3:1\` (view \`a.B\`)\n`

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

  it('done removes the request and answers its result; numbers are never reused', () => {
    const root = mkdtempSync(join(tmpdir(), 'hozu-requests-'))
    saveRequest(root, md('One'), new Date('2026-10-02T10:00:00Z'))
    saveRequest(root, md('Two'), new Date('2026-10-02T10:00:00Z'))
    expect(finishRequest(root, '2', 'Added text-2xl to the button')).toMatchObject({
      number: '0002',
      status: 'done',
      result: 'Added text-2xl to the button',
    })
    expect(listRequests(root).map((r) => r.number)).toEqual(['0001'])
    expect(saveRequest(root, md('Three')).number).toBe('0003')
    expect(() => finishRequest(root, '0009', 'x')).toThrow('No request 0009')
  })

  it('a title without Latin letters names the file after its parts', () => {
    const root = mkdtempSync(join(tmpdir(), 'hozu-requests-'))
    const md =
      '# Hozu request: 換個字型 + 1 more\n\n## 1. <h1>\n- Want: 換個字型\n\n## 2. <button> · ui.Button\n- Want: hover\n'
    expect(saveRequest(root, md).file).toBe('.hozu/requests/0001-h1-button-ui-button.md')
  })

  it('an empty project has no requests', () => {
    expect(listRequests(mkdtempSync(join(tmpdir(), 'hozu-requests-')))).toEqual([])
  })

  it('reads one request without its front matter, and deletes it', () => {
    const root = mkdtempSync(join(tmpdir(), 'hozu-requests-'))
    saveRequest(root, md('One'), new Date('2026-10-02T10:00:00Z'))
    saveRequest(root, md('Two'), new Date('2026-10-02T10:00:00Z'))
    expect(readRequest(root, '2')).toMatchObject({
      number: '0002',
      title: 'Two',
      markdown: expect.stringMatching(/^# Hozu request: Two\n/),
    })
    deleteRequest(root, '0001')
    expect(listRequests(root).map((r) => r.number)).toEqual(['0002'])
    expect(saveRequest(root, md('Three')).number).toBe('0003')
    expect(() => readRequest(root, '0001')).toThrow('No request 0001')
  })
})
