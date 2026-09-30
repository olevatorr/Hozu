import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadHeldout } from './heldout.mjs'

const fixture = (name) => fileURLToPath(new URL(`./test-fixtures/${name}`, import.meta.url))
const registry = () => {
  const checks = [
    { id: 'N1', since: 0, until: Infinity },
    { id: 'TG1', since: 20, until: Infinity },
  ]
  const check = (id, since, what, spec, run, until = Infinity) =>
    checks.push({ id, since, until, what, spec, run })
  return { checks, check }
}
const helpers = { vocab: (k) => ({ home: k >= 9 ? '/notes' : '/' }), assert: () => {} }

test('no HOZU_HELDOUT loads nothing', async () => {
  const r = registry()
  assert.equal(await loadHeldout(undefined, { ...r, helpers }), null)
  assert.equal(r.checks.length, 2)
})

test('the fixture registers its checks and retires TG1 from step 22', async () => {
  const r = registry()
  const out = await loadHeldout(fixture('heldout-fixture.mjs'), { ...r, helpers })
  assert.deepEqual(out.added, ['X21a', 'X21b', 'X22a'])
  assert.deepEqual(out.retires, { TG1: 22 })
  assert.match(out.sha256, /^[0-9a-f]{64}$/)
  const at = (step) => r.checks.filter((c) => c.since <= step && step < c.until).map((c) => c.id)
  assert.deepEqual(at(20), ['N1', 'TG1'])
  assert.deepEqual(at(21), ['N1', 'TG1', 'X21a', 'X21b'])
  assert.deepEqual(at(22), ['N1', 'X21a', 'X21b', 'X22a'])
  assert.deepEqual(at(23), ['N1', 'X21a', 'X21b'])
})

test('a held-out id outside the X range is refused', async () => {
  await assert.rejects(
    loadHeldout(fixture('heldout-bad.mjs'), { ...registry(), helpers }),
    /must start with X/,
  )
})
