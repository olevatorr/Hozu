import {
  type At,
  at,
  eventFields,
  type GuardExpr,
  resolveAt,
  type SendIR,
  type ValueExpr,
} from '@tenonkit/core/ir'
import type { Ctx } from '../context.ts'
import { closest, didYouMean } from '../suggest.ts'
import { walkView } from '../walk.ts'

type Visit = (field: string, pointer: At) => void

function domRefs(v: ValueExpr, pointer: At, visit: Visit) {
  if ('ref' in v) {
    if (v.ref === 'dom') visit(v.path[0] ?? '', at(pointer, 'path', 0))
  } else if ('object' in v) for (const k in v.object) domRefs(v.object[k]!, at(pointer, 'object', k), visit)
  else if ('fn' in v) domRefs(v.arg, at(pointer, 'arg'), visit)
  else if ('test' in v) guardDomRefs(v.test, at(pointer, 'test'), visit)
  else if ('link' in v) {
    domRefs(v.params, at(pointer, 'params'), visit)
    domRefs(v.search, at(pointer, 'search'), visit)
  }
}

function guardDomRefs(g: GuardExpr, pointer: At, visit: Visit) {
  switch (g.op) {
    case 'and':
    case 'or':
      g.args.forEach((a, i) => guardDomRefs(a, at(pointer, 'args', i), visit))
      return
    case 'not':
      guardDomRefs(g.arg, at(pointer, 'arg'), visit)
      return
    case 'fn':
      domRefs(g.arg, at(pointer, 'arg'), visit)
      return
    default:
      domRefs(g.left, at(pointer, 'left'), visit)
      domRefs(g.right, at(pointer, 'right'), visit)
  }
}

export function domFields(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        const outside: Visit = (field, p) =>
          ctx.report(
            'TN027',
            f.id,
            p,
            `ui.dom.${field} is read outside an event handler`,
            'DOM fields only exist while an event is being handled: read them in ui.send(…) payloads.',
            {
              summary: 'Send the DOM value into the machine and read it from context',
              snippet: null,
              patch: null,
            },
          )
        const fieldsFor = (on: Record<string, SendIR>, pointer: At) => {
          for (const [event, send] of Object.entries(on)) {
            const allowed: readonly string[] = eventFields[event as keyof typeof eventFields] ?? []
            domRefs(send.payload, at(pointer, 'on', event, 'payload'), (field, p) => {
              if (allowed.includes(field)) return
              const guess = closest(field, allowed)
              ctx.report(
                'TN027',
                f.id,
                p,
                `"${event}" events have no DOM field "${field}".${didYouMean(guess)}`,
                allowed.length
                  ? `Fields available on ${event}: ${allowed.join(', ')}.`
                  : `${event} events carry no DOM fields.`,
                {
                  summary: guess ? `Read ui.dom.${guess}` : 'Remove the DOM field from the payload',
                  snippet: null,
                  patch: guess ? [{ op: 'replace', path: resolveAt(p), value: guess }] : null,
                },
              )
            })
          }
        }
        switch (node.kind) {
          case 'widget':
            domRefs(node.props, at(pointer, 'props'), outside)
            for (const key of ['toggle', 'vars'] as const)
              for (const [name, v] of Object.entries(node[key])) domRefs(v, at(pointer, key, name), outside)
            for (const [event, send] of Object.entries(node.on))
              domRefs(send.payload, at(pointer, 'on', event, 'payload'), (field, p) => {
                if (field !== 'detail')
                  ctx.report(
                    'TN027',
                    f.id,
                    p,
                    `Widget event "${event}" carries only its detail`,
                    'Read the widget event payload through the handler argument: (detail) => ui.send(…, { x: detail.x }).',
                  )
              })
            return
          case 'el':
            for (const key of ['attrs', 'toggle', 'vars'] as const)
              for (const [name, v] of Object.entries(node[key])) domRefs(v, at(pointer, key, name), outside)
            fieldsFor(node.on, pointer)
            return
          case 'text':
          case 'html':
            domRefs(node.value, at(pointer, 'value'), outside)
            return
          case 'if':
            guardDomRefs(node.test, at(pointer, 'test'), outside)
            return
          case 'global':
            fieldsFor(node.on, pointer)
            return
          case 'each':
            domRefs(node.source, at(pointer, 'source'), outside)
            return
          case 'query':
            domRefs(node.input, at(pointer, 'input'), outside)
            return
          default:
            return
        }
      })
}
