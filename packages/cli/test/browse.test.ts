import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import { findBrowser } from '../src/cdp.ts'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const stations = `${root}examples/stations`
const ajv = new Ajv({ allErrors: true, strict: false })
const schema = JSON.parse(readFileSync(`${root}packages/cli/schema/browse.schema.json`, 'utf8'))

async function browse(args: string[], cwd = stations) {
  let stdout = ''
  const code = await main(['browse', ...args, '--json'], cwd, (s) => {
    stdout += s
  })
  const out = JSON.parse(stdout)
  expect(ajv.validate(schema, out), JSON.stringify(ajv.errors)).toBe(true)
  return { code, out }
}

describe.skipIf(!findBrowser())('hozu browse (ADR 0040 D)', () => {
  it('mounts every widget, runs the steps in order and reports the page after them', async () => {
    const { code, out } = await browse([
      '/',
      '--do',
      'fill Search=park',
      '--do',
      'click Tech Park',
      '--select',
      'canvas',
    ])
    expect(code).toBe(0)
    expect(out.status).toBe(200)
    expect(out.hydrated).toBe(true)
    expect(out.errors).toEqual([])
    expect(out.steps.map((s: { ok: boolean }) => s.ok)).toEqual([true, true])
    expect(
      Object.fromEntries(out.widgets.map((w: { name: string; state: string }) => [w.name, w.state])),
    ).toEqual({
      'stations.Counter': 'mounted',
      'stations.StationMap': 'mounted',
      'stations.FadeIn': 'mounted',
      'stations.DistrictChart': 'mounted',
      'stations.Globe': 'mounted',
    })
    expect(out.text).toContain('Available bikes: 15')
    expect(out.text).toContain('Docks: 24')
    expect(out.elements.map((e: { attrs: Record<string, string> }) => e.attrs['aria-label'])).toContain(
      'Bikes by district',
    )
  }, 60_000)

  it('fails with the names on the page when a step finds nothing, and reports failed requests', async () => {
    const missing = await browse(['/', '--do', 'click Delete everything', '--do', 'wait 10'])
    expect(missing.code).toBe(1)
    expect(missing.out.steps[0].ok).toBe(false)
    expect(missing.out.steps[0].note).toContain('No click target named "Delete everything". On the page:')
    expect(missing.out.steps[0].note).toContain('"Start tour"')
    expect(missing.out.steps[1].note).toBe('skipped after a failed step')
    const lost = await browse(['/nowhere'])
    expect(lost.code).toBe(1)
    expect(lost.out.status).toBe(404)
    expect(lost.out.errors[0]).toMatchObject({ kind: 'request', text: '404 /nowhere' })
  }, 60_000)

  it('reports a widget whose setup throws, with the error', async () => {
    const copy = `${root}.tmp/stations-broken`
    rmSync(copy, { recursive: true, force: true })
    mkdirSync(copy, { recursive: true })
    cpSync(stations, copy, { recursive: true, filter: (f) => !f.includes('node_modules') })
    symlinkSync(`${stations}/node_modules`, `${copy}/node_modules`)
    const map = `${copy}/features/stations/map.client.ts`
    writeFileSync(
      map,
      readFileSync(map, 'utf8').replace('const map = L.map', "throw new Error('boom')\n  const map = L.map"),
    )
    try {
      const { code, out } = await browse(['/'], copy)
      expect(code).toBe(1)
      expect(out.errors).toEqual([
        expect.objectContaining({ kind: 'console', text: 'Widget stations.StationMap failed Error: boom' }),
      ])
      expect(out.widgets.find((w: { name: string }) => w.name === 'stations.StationMap')).toMatchObject({
        state: 'failed',
        hint: 'its setup threw; see errors',
      })
    } finally {
      rmSync(copy, { recursive: true, force: true })
    }
  }, 60_000)
})
