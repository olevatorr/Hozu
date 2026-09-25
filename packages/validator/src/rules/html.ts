import { type At, anyRef, at, resolveAt, type ValueExpr, type ViewNode } from '@tenon/core/ir'
import type { Ctx } from '../context.ts'
import { featurePointer } from '../walk.ts'

const untrusted = (v: ValueExpr, tainted: boolean[]) =>
  anyRef(
    v,
    (r) =>
      r.ref === 'context' ||
      r.ref === 'dom' ||
      r.ref === 'params' ||
      (r.ref === 'binding' && tainted[r.depth] === true),
  )

export function unsafeHtml(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features))
    for (const [vid, view] of Object.entries(f.views)) {
      const walk = (n: ViewNode, pointer: At, tainted: boolean[]) => {
        const kids = (list: ViewNode[], key: string) =>
          list.forEach((c, i) => walk(c, at(pointer, key, i), tainted))
        switch (n.kind) {
          case 'html':
            if (untrusted(n.value, tainted))
              ctx.report(
                'TN030',
                f.id,
                at(pointer, 'value'),
                'ui.html renders a value the client or URL controls',
                'Context, DOM fields and route params can carry user input; rendering them as HTML allows script injection (XSS). Only query results (sanitized by the server) and literals may be rendered as HTML.',
                {
                  summary: 'Render it as text, or sanitize it on the server and read it from a query',
                  snippet: null,
                  patch: [
                    {
                      op: 'replace',
                      path: resolveAt(pointer),
                      value: { id: n.id, kind: 'text', value: n.value },
                    },
                  ],
                },
              )
            return
          case 'el':
          case 'when':
          case 'widget':
            kids(n.children, 'children')
            return
          case 'if':
            kids(n.then, 'then')
            kids(n.else, 'else')
            return
          case 'each':
            walk(n.item, at(pointer, 'item'), [...tainted, untrusted(n.source, tainted)])
            return
          case 'query': {
            const input = untrusted(n.input, tainted)
            walk(n.ready, at(pointer, 'ready'), [...tainted, false])
            if (n.pending) walk(n.pending, at(pointer, 'pending'), tainted)
            for (const [name, c] of Object.entries(n.failed))
              walk(c, at(pointer, 'failed', name), [...tainted, input])
            return
          }
          default:
            return
        }
      }
      walk(view.root, featurePointer(f.id, 'views', vid, 'root'), [])
    }
}
