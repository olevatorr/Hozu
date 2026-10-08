import { feature, mutation, part, project } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { expect, it } from 'vitest'
import { z } from 'zod'

const staffOnly = part(({ session }: { session: { role: string } }) => session.role !== 'editor')
const save = mutation({
  input: z.object({}),
  output: z.object({}),
  runs: 'server',
  access: { allow: staffOnly },
})
const ship = mutation({
  input: z.object({}),
  output: z.object({}),
  runs: 'server',
  access: { allow: staffOnly },
})

it('a part shares one allow rule between effects (ADR 0069 B6)', () => {
  const b = buildProject(
    project({
      schema: zodAdapter,
      session: z.object({ role: z.string() }),
      routes: {},
      pages: [],
      features: [feature({ id: 'x', intent: { summary: 'staff' }, declarations: [{ save, ship }] })],
    }),
  )
  expect(b.diagnostics).toEqual([])
  const rule = {
    kind: 'allow',
    test: { op: 'neq', left: { ref: 'session', path: ['role'] }, right: { literal: 'editor' } },
  }
  expect(b.ir.features.x!.mutations.save!.access).toEqual(rule)
  expect(b.ir.features.x!.mutations.ship!.access).toEqual(rule)
})
