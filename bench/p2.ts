import { buildProject } from '@tenon/core/ir'
import { validate } from '@tenon/validator'
import { syntheticProject } from './synthetic.ts'

const features = Number(process.argv[2] ?? 1000)
const project = syntheticProject(features)
const samples: number[] = []
for (let i = 0; i < 9; i++) {
  const start = performance.now()
  const r = buildProject(project, { sources: false })
  if (r.diagnostics.length) throw new Error(`synthetic build: ${r.diagnostics[0]!.message}`)
  const d = validate(r.ir)
  if (d.length) throw new Error(`synthetic validate: ${d[0]!.code} ${d[0]!.message}`)
  if (i >= 2) samples.push(performance.now() - start)
}
process.stdout.write(JSON.stringify(samples))
