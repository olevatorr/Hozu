import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { devtoolsMessages } from '@hozu/devtools'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import { messagesFileOf } from '../src/commands/devtools.ts'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const studio = join(root, 'examples/studio')
const schema = JSON.parse(readFileSync(`${root}packages/cli/schema/devtools-messages.schema.json`, 'utf8'))
const run = async (args: string[]) => {
  let text = ''
  const code = await main(['devtools', ...args], studio, (s) => {
    text += s
  })
  return { code, text }
}

describe('hozu devtools messages (ADR 0060 D)', () => {
  it('prints every DevTools string, in English, as the file to translate', async () => {
    const { code, text } = await run(['messages', '--json'])
    const out = JSON.parse(text)
    expect([code, new Ajv({ strict: false }).validate(schema, out)]).toEqual([0, true])
    expect(out.messages).toEqual(devtoolsMessages)
    expect(Object.keys(out.messages).length).toBeGreaterThan(300)
    const human = JSON.parse((await run(['messages'])).text)
    expect(human).toEqual({ hozu: out.hozu, messages: devtoolsMessages })
  })

  it('checks a translation: the reference names no stale key and keeps every placeholder', async () => {
    const reference = await run(['messages', '--check', 'devtools.zh-TW.json', '--json'])
    const out = JSON.parse(reference.text)
    expect([reference.code, out.unknown, out.placeholders]).toEqual([0, [], []])
    const dir = mkdtempSync(join(tmpdir(), 'hozu-messages-'))
    const file = join(dir, 'broken.json')
    writeFileSync(
      file,
      JSON.stringify({ messages: { 'dock.select': '選取', 'dock.gone': 'x', 'dock.screen': '畫面' } }),
    )
    const broken = await run(['messages', '--check', file])
    expect(broken.code).toBe(1)
    expect(broken.text).toContain('unknown      dock.gone')
    expect(broken.text).toContain('placeholders dock.screen')
    expect(broken.text).toContain(`missing      dock.browse`)
  })

  it('takes the flag over HOZU_DEVTOOLS_MESSAGES, and refuses a file that is not there', () => {
    const before = process.env.HOZU_DEVTOOLS_MESSAGES
    try {
      process.env.HOZU_DEVTOOLS_MESSAGES = join(studio, 'devtools.zh-TW.json')
      expect(messagesFileOf(undefined, studio)).toBe(join(studio, 'devtools.zh-TW.json'))
      expect(messagesFileOf('package.json', studio)).toBe(join(studio, 'package.json'))
      delete process.env.HOZU_DEVTOOLS_MESSAGES
      expect(messagesFileOf(undefined, studio)).toBeNull()
      expect(() => messagesFileOf('nope.json', studio)).toThrow('does not exist')
    } finally {
      if (before === undefined) delete process.env.HOZU_DEVTOOLS_MESSAGES
      else process.env.HOZU_DEVTOOLS_MESSAGES = before
    }
  })
})
