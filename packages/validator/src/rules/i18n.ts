import {
  type At,
  at,
  type GuardExpr,
  join,
  placeholders,
  resolveAt,
  type TransitionIR,
  type ValueExpr,
  type ViewNode,
} from '@tenon/core/ir'
import type { Ctx } from '../context.ts'
import { walkView } from '../walk.ts'

type Visit = (value: ValueExpr, pointer: At) => void

function scanValue(value: ValueExpr, pointer: At, visit: Visit) {
  visit(value, pointer)
  if ('object' in value)
    for (const [k, v] of Object.entries(value.object)) scanValue(v, at(pointer, 'object', k), visit)
  else if ('fn' in value) scanValue(value.arg, at(pointer, 'arg'), visit)
  else if ('link' in value) {
    scanValue(value.params, at(pointer, 'params'), visit)
    scanValue(value.search, at(pointer, 'search'), visit)
  } else if ('test' in value) scanGuard(value.test, at(pointer, 'test'), visit)
}

function scanGuard(guard: GuardExpr, pointer: At, visit: Visit) {
  switch (guard.op) {
    case 'and':
    case 'or':
      guard.args.forEach((g, i) => scanGuard(g, at(pointer, 'args', i), visit))
      return
    case 'not':
      scanGuard(guard.arg, at(pointer, 'arg'), visit)
      return
    case 'fn':
      scanValue(guard.arg, at(pointer, 'arg'), visit)
      return
    default:
      scanValue(guard.left, at(pointer, 'left'), visit)
      scanValue(guard.right, at(pointer, 'right'), visit)
  }
}

function nodeValues(node: ViewNode, pointer: At, visit: Visit) {
  const record = (m: Record<string, ValueExpr>, key: string) => {
    for (const [k, v] of Object.entries(m)) scanValue(v, at(pointer, key, k), visit)
  }
  const sends = (on: Record<string, { payload: ValueExpr }>) => {
    for (const [k, s] of Object.entries(on)) scanValue(s.payload, at(pointer, 'on', k, 'payload'), visit)
  }
  switch (node.kind) {
    case 'el':
      record(node.attrs, 'attrs')
      record(node.toggle, 'toggle')
      record(node.vars, 'vars')
      sends(node.on)
      return
    case 'widget':
      scanValue(node.props, at(pointer, 'props'), visit)
      record(node.toggle, 'toggle')
      record(node.vars, 'vars')
      sends(node.on)
      return
    case 'text':
    case 'html':
      scanValue(node.value, at(pointer, 'value'), visit)
      return
    case 'global':
      sends(node.on)
      return
    case 'if':
      scanGuard(node.test, at(pointer, 'test'), visit)
      return
    case 'each':
      scanValue(node.source, at(pointer, 'source'), visit)
      return
    case 'query':
      scanValue(node.input, at(pointer, 'input'), visit)
      return
    default:
      return
  }
}

const localeBound = (v: ValueExpr) =>
  ('fn' in v && v.fn.startsWith('#')) ||
  ('ref' in v && (v.ref === 'locale' || v.ref === 'alternate' || v.ref === 'env'))

export function i18n(ctx: Ctx) {
  const { ir } = ctx
  const site = ir.site
  const locales = site?.locales ?? null
  const all = locales ?? (site ? [site.lang] : [])

  if (site && locales) {
    const at0 = join('', 'site', 'locales')
    if (!locales.length)
      ctx.report(
        'TN042',
        null,
        at0,
        'site.locales is empty',
        'A site with locales needs at least its default one.',
        {
          summary: `List at least "${site.lang}"`,
          snippet: null,
          patch: [{ op: 'replace', path: at0, value: [site.lang] }],
        },
      )
    else if (!locales.includes(site.lang))
      ctx.report(
        'TN042',
        null,
        at0,
        `site.lang "${site.lang}" is not one of site.locales`,
        'site.lang is the default locale, so it must be listed.',
        {
          summary: `Add "${site.lang}"`,
          snippet: null,
          patch: [{ op: 'add', path: `${at0}/-`, value: site.lang }],
        },
      )
    locales.forEach((l, i) => {
      let canonical: string | null = null
      try {
        canonical = Intl.getCanonicalLocales(l)[0] ?? null
      } catch {}
      if (canonical === l) return
      const pointer = join(at0, i)
      ctx.report(
        'TN042',
        null,
        pointer,
        `"${l}" is not a canonical BCP 47 language tag`,
        'Locales appear in URLs, hreflang and Intl, which all expect canonical tags.',
        {
          summary: canonical ? `Use "${canonical}"` : 'Remove it',
          snippet: null,
          patch: [
            canonical ? { op: 'replace', path: pointer, value: canonical } : { op: 'remove', path: pointer },
          ],
        },
      )
    })
  }

  for (const f of Object.values(ir.features)) {
    const m = f.messages
    if (m) {
      const base = m.text[m.base] ?? {}
      for (const l of all) {
        const text = m.text[l]
        const where = join('', 'features', f.id, 'messages', 'text', l)
        if (!text) {
          ctx.report('TN040', f.id, where, `Messages have no "${l}" text`, `The site renders in "${l}".`, {
            summary: `Add "${l}" (starting from the "${m.base}" text)`,
            snippet: null,
            patch: [{ op: 'add', path: where, value: base }],
          })
          continue
        }
        for (const [key, template] of Object.entries(base)) {
          const pointer = join(where, key)
          const own = text[key]
          const why =
            own === undefined
              ? `"${l}" has no message "${key}"`
              : placeholders(own).join() !== placeholders(template).join()
                ? `"${l}" message "${key}" uses {${placeholders(own).join(', ')}}, "${m.base}" uses {${placeholders(template).join(', ')}}`
                : null
          if (why)
            ctx.report(
              'TN040',
              f.id,
              pointer,
              why,
              'Every locale needs every message, with the same placeholders.',
              {
                summary: `Translate "${key}" for "${l}"`,
                snippet: null,
                patch: [{ op: own === undefined ? 'add' : 'replace', path: pointer, value: template }],
              },
            )
        }
      }
    }

    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) =>
        nodeValues(node, pointer, (v, p) => {
          if ('fn' in v && v.fn.startsWith('#msg:')) {
            const ref = v.fn.slice(5)
            const dot = ref.indexOf('.')
            const owner = ir.features[ref.slice(0, dot)]?.messages
            if (!owner || !(ref.slice(dot + 1) in (owner.text[owner.base] ?? {})))
              ctx.report(
                'TN007',
                f.id,
                p,
                `Unknown message ${ref}`,
                'Messages are declared with ui.messages.',
                {
                  summary: 'Remove the message',
                  snippet: null,
                  patch: [{ op: 'replace', path: resolveAt(p), value: { literal: '' } }],
                },
              )
          }
          if ('ref' in v && v.ref === 'alternate' && !all.includes(v.path[0] ?? ''))
            ctx.report(
              'TN042',
              f.id,
              p,
              `ui.alternate("${v.path[0]}") names a locale the site does not declare`,
              'Alternates link to the same page in a declared locale.',
              {
                summary: 'Remove the link target',
                snippet: null,
                patch: [{ op: 'replace', path: resolveAt(p), value: { literal: null } }],
              },
            )
        }),
      )

    const machine = f.machine
    if (!machine) continue
    const flag: Visit = (x, q) => {
      if (!localeBound(x)) return
      ctx.report(
        'TN041',
        f.id,
        q,
        'A machine uses a message, a format, the locale or the environment',
        'Machines and contracts are independent of locale and deployment. Store a code in context and choose the text in the view.',
        {
          summary: 'Store a code instead',
          snippet: null,
          patch: [{ op: 'replace', path: resolveAt(q), value: { literal: null } }],
        },
      )
    }
    const transition = (t: TransitionIR, tp: string) => {
      if (t.guard) scanGuard(t.guard, join(tp, 'guard'), flag)
      t.assign.forEach((a, j) => scanValue(a.value, join(tp, 'assign', j, 'value'), flag))
      if (t.navigate) scanValue(t.navigate, join(tp, 'navigate'), flag)
    }
    const list = (ts: TransitionIR[], pointer: string) =>
      ts.forEach((t, i) => transition(t, join(pointer, i)))
    for (const [name, s] of Object.entries(machine.states)) {
      const sp = join('', 'features', f.id, 'machine', 'states', name)
      for (const [event, ts] of Object.entries(s.on)) list(ts, join(sp, 'on', event))
      s.after.forEach((a, i) => transition(a.transition, join(sp, 'after', i, 'transition')))
      if (s.invoke) {
        scanValue(s.invoke.input, join(sp, 'invoke', 'input'), flag)
        list(s.invoke.done, join(sp, 'invoke', 'done'))
        for (const [error, ts] of Object.entries(s.invoke.failed))
          list(ts, join(sp, 'invoke', 'failed', error))
      }
    }
  }
}
