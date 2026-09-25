import { at, type Json, resolveAt } from '@tenon/core/ir'
import type { Ctx } from '../context.ts'
import { resolveRef } from '../resolve.ts'
import { featurePointer, walkView } from '../walk.ts'

export function unhandledEvents(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features)) {
    const states = Object.values(f.machine?.states ?? {})
    for (const symbol of Object.keys(f.events)) {
      const ref = `${f.id}.${symbol}`
      if (states.some((s) => s.on[ref]?.length)) continue
      const p = featurePointer(f.id, 'events', symbol)
      const exported = f.exports.events.indexOf(symbol)
      ctx.report(
        'TN002',
        f.id,
        p,
        `Event ${ref} is declared but no state handles it`,
        f.machine
          ? `No state of the ${f.id} machine has on(${symbol}, …).`
          : `${f.id} has no machine, so its events can never be handled.`,
        {
          summary: `Handle ${symbol} in a state, or remove the event`,
          snippet: `on(${symbol}, { target: '${f.machine?.initial ?? 'someState'}' })`,
          patch: [
            ...(exported >= 0
              ? [
                  {
                    op: 'remove' as const,
                    path: resolveAt(featurePointer(f.id, 'exports', 'events', exported)),
                  },
                ]
              : []),
            { op: 'remove', path: resolveAt(p) },
          ],
        },
      )
    }
  }
}

export function viewEvents(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ctx.ir, f, vid, view, ({ node, pointer, visible }) => {
        if (node.kind !== 'el') return
        for (const [dom, send] of Object.entries(node.on)) {
          const r = resolveRef(ctx.ir, send.event, 'event')
          const m = r?.feature.machine
          if (!r || !m) continue
          const own = r.feature.id === f.id && visible !== null
          const shown = own ? visible : Object.keys(m.states)
          const handling = new Set(
            Object.entries(m.states)
              .filter(([, s]) => s.on[send.event]?.length)
              .map(([n]) => n),
          )
          const missing = shown.filter((s) => !handling.has(s))
          if (!missing.length) continue
          const allowed = shown.filter((s) => handling.has(s))
          const wrap = own && allowed.length > 0
          ctx.report(
            'TN005',
            f.id,
            at(pointer, 'on', dom),
            `${send.event} can be sent while ${r.feature.id} is in ${missing.map((s) => `"${s}"`).join(', ')}, where it is not handled`,
            own
              ? 'A node may only send an event when every state in which it is visible handles that event.'
              : `The sender cannot observe the state of ${r.feature.id}, so every one of its states must handle ${send.event}.`,
            wrap
              ? {
                  summary: `Wrap the node in when([${allowed.map((s) => `'${s}'`).join(', ')}], …)`,
                  snippet: `when([${allowed.map((s) => `'${s}'`).join(', ')}], [/* node */])`,
                  patch: [
                    {
                      op: 'replace',
                      path: resolveAt(pointer),
                      value: {
                        id: `${node.id}~when`,
                        kind: 'when',
                        states: allowed,
                        children: [node],
                      } as unknown as Json,
                    },
                  ],
                }
              : {
                  summary: `Handle ${send.event} in ${missing.join(', ')}, or stop sending it from here`,
                  snippet: null,
                  patch: [{ op: 'remove', path: resolveAt(at(pointer, 'on', dom)) }],
                },
          )
        }
      })
}
