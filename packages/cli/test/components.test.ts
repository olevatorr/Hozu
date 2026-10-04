import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv } from 'ajv'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { main } from '../src/main.ts'

vi.setConfig({ testTimeout: 30_000 })

const root = fileURLToPath(new URL('../../../', import.meta.url))
const notes = join(root, 'examples', 'notes')
const ajv = new Ajv({ allErrors: true, strict: false })
const schema = (name: string) =>
  JSON.parse(readFileSync(`${root}packages/cli/schema/${name}.schema.json`, 'utf8'))

async function run(args: string[], cwd = notes) {
  let stdout = ''
  const code = await main(args, cwd, (s) => {
    stdout += s
  })
  return { code, stdout }
}

const json = async (name: string, args: string[], cwd = notes) => {
  const { code, stdout } = await run([...args, '--json'], cwd)
  const out = JSON.parse(stdout)
  expect(ajv.validate(schema(name), out), JSON.stringify(ajv.errors)).toBe(true)
  return { code, out }
}

const empty = mkdtempSync(join(tmpdir(), 'hozu-docs-'))
afterAll(() => rmSync(empty, { recursive: true, force: true }))

describe('the component tools (ADR 0045 I)', () => {
  it('prints the components topic, then the app catalog, within 5 KiB on notes', async () => {
    const { code, stdout } = await run(['docs', 'components'])
    expect(code).toBe(0)
    expect(stdout).toMatch(/^# Components/)
    expect(stdout.slice(stdout.indexOf('In this app:'))).toBe(
      'In this app:\n  ui.Button <button> tone\n  ui.Input <input>\n  ui.Field <div>\nhozu inspect <id>: props, slots, events and every use\n',
    )
    expect(stdout.length).toBeLessThanOrEqual(5120)
    const { out } = await json('docs-components', ['docs', 'components'])
    expect(out.text).toBe(stdout)
    const button = out.components.find((c: { id: string }) => c.id === 'ui.Button')
    expect(button).toMatchObject({
      owner: { kind: 'kit', id: 'ui' },
      tag: 'button',
      variants: { tone: { values: ['primary', 'subtle', 'plain'], default: 'primary' } },
      children: true,
      events: ['press'],
      client: null,
    })
    expect(button.props).toContainEqual({
      name: 'type',
      type: '"button" | "submit"',
      required: false,
      default: 'button',
    })
  })

  it('prints only the topic outside an app', async () => {
    const { code, stdout } = await run(['docs', 'components'], empty)
    expect(code).toBe(0)
    expect(stdout).toMatch(/^# Components/)
    expect(stdout).not.toContain('In this app:')
  })

  it('renders one component alone with its root class and owned properties', async () => {
    const { code, out } = await json('render', [
      'render',
      'ui.Button',
      '--variant',
      'tone=subtle',
      '--props',
      '{"type":"submit"}',
    ])
    expect(code).toBe(0)
    expect(out).toMatchObject({
      ok: true,
      component: 'ui.Button',
      variant: { tone: 'subtle' },
      html: '<button class="text-sm text-slate-600 underline" type="submit"></button>',
      class: 'text-sm text-slate-600 underline',
      diagnostics: [],
    })
    expect(out.owned).toEqual(expect.arrayContaining(['background-color', 'border-radius', 'color']))
    const field = await run([
      'render',
      'ui.Field',
      '--props',
      '{"for":"n","label":"Name","error":"Required","errorId":"e"}',
      '--slot',
      'control=X',
    ])
    expect(field.stdout).toContain(
      '<div class="space-y-3"><label class="block text-sm font-medium" for="n">Name</label>X<p class="text-sm text-rose-600" id="e">Required</p></div>',
    )
  })

  it('prints a passing render within 512 B', async () => {
    const { code, stdout } = await run(['render', 'ui.Button', '--variant', 'tone=subtle'])
    expect(code).toBe(0)
    expect(stdout).toMatch(/^✔ ui\.Button tone=subtle\n<button /)
    expect(stdout.length).toBeLessThanOrEqual(512)
  })

  it('exits 1 with the diagnostic at the declaration when a use is wrong', async () => {
    const { code, out } = await json('render', ['render', 'ui.Button', '--variant', 'tone=loud'])
    expect(code).toBe(1)
    expect(out.ok).toBe(false)
    expect(out.html).toBe('')
    expect(out.diagnostics.map((d: { code: string }) => d.code)).toEqual(['HZ031'])
    expect(out.diagnostics[0].location.source.file).toBe('ui/button.ts')
    expect((await run(['render', 'ui.Nope'])).code).toBe(2)
    expect((await run(['render', 'ui.Button', '--variant', 'tone'])).code).toBe(2)
  })

  it('inspects a component: the declaration and every use with its classes and overrides', async () => {
    const { out } = await json('inspect', ['inspect', 'ui.Button'])
    expect(out.component).toBe('ui.Button')
    expect(out.owner).toEqual({ kind: 'kit', id: 'ui' })
    expect(out.uses).toHaveLength(7)
    expect(out.uses).toContainEqual(
      expect.objectContaining({
        feature: 'account',
        added: ['w-full', 'rounded-lg!'],
        overrides: ['rounded-lg!'],
      }),
    )
    const { stdout } = await run(['inspect', 'ui.Button'])
    expect(stdout).toMatch(/^ui\.Button <button> · kit ui {2}ui\/button\.ts:\d+\n/)
    expect(stdout.split('\n').slice(1, 4)).toEqual([
      'variant tone: primary* subtle plain',
      'props type?: "button" | "submit" = "button", name?: string, value?: string',
      'children · events press',
    ])
    expect(stdout).toMatch(
      /^ {2}account\.Login\/2\/1 {2}features\/account\/views\.ts:\d+ · tone=primary · adds w-full · overrides rounded-lg!$/m,
    )
  })

  it('lists who uses a component with hozu why', async () => {
    const { out: why } = await json('why', ['why', 'ui.Input'])
    const out = why.impact
    expect(out).toMatchObject({ target: 'ui.Input', kind: 'component', features: ['account', 'notes'] })
    expect(out.uses.map((u: { added: string[] }) => u.added)).toEqual([['w-full'], ['flex-1'], ['w-full']])
    expect((await run(['why', 'ui.Input'])).stdout).toMatch(
      /^ui\.Input {2}component {2}at [^\n]+\nui\.Input {2}\(component, kit ui\)\nuses:\n/,
    )
  })

  it('maps the kits and the components each page uses', async () => {
    const { stdout } = await run(['map'])
    expect(stdout).toMatch(/\n {2}ui\/kit\.ts kits\nkits: ui 3\nroutes\n/)
    expect(stdout).toMatch(
      /^ {2}login \/login → Login · uses ui\.Button ui\.Field ui\.Input {2}hozu\.config\.ts:\d+$/m,
    )
    const { out } = await json('map', ['map'])
    expect(out.kits).toEqual([{ id: 'ui', components: 3 }])
    expect(out.routes.find((r: { id: string }) => r.id === 'admin').components).toEqual(['ui.Button'])
  })
})
