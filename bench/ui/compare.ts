// ADR 0045 phase 1: node bench/ui/compare.ts <dir>, after baseline.ts --out <dir>
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = fileURLToPath(new URL('./baseline-0.8/', import.meta.url))
const dir = resolve(process.argv[2] ?? '')

const v2 = (ir: Record<string, any>) => {
  const { kits, ...rest } = ir
  if (JSON.stringify(kits) !== '{}') throw new Error('kits is not {}')
  for (const feature of Object.values(rest.features) as Record<string, any>[]) {
    if (JSON.stringify(feature.components) !== '{}') throw new Error(`${feature.id}: components is not {}`)
    delete feature.components
  }
  return { ...rest, irVersion: 2 }
}

const names = readdirSync(base).filter((f) => f.endsWith('.ir.json'))
let equal = 0
for (const name of names) {
  const before = JSON.parse(readFileSync(join(base, name), 'utf8'))
  const after = JSON.parse(readFileSync(join(dir, name), 'utf8'))
  if (after.irVersion !== 3) throw new Error(`${name}: irVersion ${after.irVersion}`)
  const same = JSON.stringify(before) === JSON.stringify(v2(after))
  if (same) equal++
  console.log(`${same ? 'equal  ' : 'DIFFERS'} ${name}`)
}
const p7 = (d: string) => JSON.parse(readFileSync(join(d, 'summary.json'), 'utf8')).p7
console.log(`${equal} / ${names.length} equal; P7 ${p7(base)} → ${p7(dir)}`)
process.exitCode = equal === names.length ? 0 : 1
