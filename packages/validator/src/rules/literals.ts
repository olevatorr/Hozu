import {
  type At,
  at,
  attrValues,
  type GuardExpr,
  type Json,
  type JsonSchema,
  resolveAt,
  type ValueExpr,
} from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import {
  contextEnv,
  type Env,
  effectSchemas,
  eventSchema,
  schemaIn,
  triggerEnv,
  valueSchema,
} from '../env.ts'
import { resolveRef } from '../resolve.ts'
import { itemsOf, mismatch, resolvePath } from '../schema.ts'
import { closest, didYouMean } from '../suggest.ts'
import { featurePointer, transitionsOf, walkView } from '../walk.ts'

function reportMismatch(
  ctx: Ctx,
  feature: string,
  pointer: At,
  value: Json,
  schema: JsonSchema | null,
  what: string,
) {
  const m = mismatch(schema, value)
  if (!m) return
  const actual = m.path.reduce<Json | undefined>(
    (v, k) => (v && typeof v === 'object' ? (v as Record<string, Json>)[k] : undefined),
    value,
  )
  const guess = typeof actual === 'string' ? closest(actual, m.options) : null
  const where = m.path.length ? `${what}.${m.path.join('.')}` : what
  const target = at(pointer, 'literal', ...m.path)
  ctx.report(
    'HZ031',
    feature,
    target,
    `${JSON.stringify(actual)} is not a valid value for ${where}.${didYouMean(guess)}`,
    `Expected ${m.expected}.`,
    {
      summary: guess ? `Use ${JSON.stringify(guess)}` : `Use a value that matches ${m.expected}`,
      snippet: null,
      patch: guess ? [{ op: 'replace', path: resolveAt(target), value: guess }] : null,
    },
  )
}

function checkValue(
  ctx: Ctx,
  feature: string,
  value: ValueExpr,
  schema: JsonSchema | null,
  pointer: At,
  what: string,
) {
  if ('literal' in value) reportMismatch(ctx, feature, pointer, value.literal, schema, what)
  else if ('object' in value)
    for (const [k, v] of Object.entries(value.object))
      checkValue(
        ctx,
        feature,
        v,
        resolvePath(schema, [k]).ok
          ? (resolvePath(schema, [k]) as { schema: JsonSchema | null }).schema
          : null,
        at(pointer, 'object', k),
        `${what}.${k}`,
      )
}

function checkLinks(ctx: Ctx, env: Env, value: ValueExpr, pointer: At) {
  if ('link' in value) {
    const r = ctx.ir.routes[value.link]
    checkValue(
      ctx,
      env.feature.id,
      value.params,
      r?.params ?? null,
      at(pointer, 'params'),
      `params of ${value.link}`,
    )
    if (!('literal' in value.search && value.search.literal === null))
      checkValue(
        ctx,
        env.feature.id,
        value.search,
        r?.search ?? null,
        at(pointer, 'search'),
        `search of ${value.link}`,
      )
  } else if ('object' in value)
    for (const [k, v] of Object.entries(value.object)) checkLinks(ctx, env, v, at(pointer, 'object', k))
  else if ('fn' in value) checkLinks(ctx, env, value.arg, at(pointer, 'arg'))
}

function checkGuard(ctx: Ctx, env: Env, guard: GuardExpr, pointer: At) {
  switch (guard.op) {
    case 'and':
    case 'or':
      guard.args.forEach((g, i) => checkGuard(ctx, env, g, at(pointer, 'args', i)))
      return
    case 'not':
      checkGuard(ctx, env, guard.arg, at(pointer, 'arg'))
      return
    case 'fn': {
      const r = resolveRef(ctx.ir, guard.fn, 'fn')
      const input = r ? schemaIn(r.feature, r.feature.fns[r.symbol]!.input) : null
      checkValue(ctx, env.feature.id, guard.arg, input, at(pointer, 'arg'), guard.fn)
      return
    }
    default:
      for (const [side, other] of [
        ['left', guard.right],
        ['right', guard.left],
      ] as const) {
        const v = guard[side]
        if ('literal' in v && !('literal' in other) && v.literal !== null)
          checkValue(
            ctx,
            env.feature.id,
            v,
            valueSchema(ctx.ir, env, other),
            at(pointer, side),
            'the compared value',
          )
      }
  }
}

function checkAttr(ctx: Ctx, feature: string, tag: string, name: string, value: ValueExpr, pointer: At) {
  const options = attrValues[tag]?.[name] ?? attrValues['*']?.[name]
  if (!options || !('literal' in value) || typeof value.literal !== 'string') return
  if (name === 'command' && value.literal.startsWith('--')) return
  reportMismatch(ctx, feature, pointer, value.literal, { enum: [...options, ''] }, `${tag}[${name}]`)
}

export function literals(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features)) {
    if (f.machine) {
      const base = contextEnv(f)
      const context = base.sources.context ?? null
      for (const [state, s] of Object.entries(f.machine.states))
        if (s.invoke)
          checkValue(
            ctx,
            f.id,
            s.invoke.input,
            effectSchemas(ir, s.invoke.effect)?.input ?? null,
            featurePointer(f.id, 'machine', 'states', state, 'invoke', 'input'),
            `input of ${s.invoke.effect}`,
          )
      for (const site of transitionsOf(f)) {
        const env = triggerEnv(ctx, f, site)
        const t = site.transition
        if (t.guard) checkGuard(ctx, env, t.guard, site.at('guard'))
        if (t.navigate) checkLinks(ctx, env, t.navigate, site.at('navigate'))
        t.assign.forEach((a, i) => {
          if (!('literal' in a.value) && !('object' in a.value)) return
          const target = resolvePath(context, a.path)
          const schema = target.ok ? target.schema : null
          const expected =
            a.op === 'append'
              ? itemsOf(schema)
              : a.op === 'removeWhere'
                ? (() => {
                    const r = resolvePath(itemsOf(schema), [a.key])
                    return r.ok ? r.schema : null
                  })()
                : a.op === 'set'
                  ? schema
                  : null
          checkValue(
            ctx,
            f.id,
            a.value,
            expected,
            site.at('assign', i, 'value'),
            `context.${a.path.join('.')}`,
          )
        })
      }
    }
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer, env }) => {
        const sends = (on: Record<string, { event: string; payload: ValueExpr }>) => {
          for (const [dom, send] of Object.entries(on))
            checkValue(
              ctx,
              f.id,
              send.payload,
              eventSchema(ir, send.event),
              at(pointer, 'on', dom, 'payload'),
              send.event,
            )
        }
        switch (node.kind) {
          case 'el':
            for (const [name, v] of Object.entries(node.attrs)) {
              checkAttr(ctx, f.id, node.tag, name, v, at(pointer, 'attrs', name))
              checkLinks(ctx, env, v, at(pointer, 'attrs', name))
              if ('test' in v) checkGuard(ctx, env, v.test, at(pointer, 'attrs', name, 'test'))
            }
            for (const [name, v] of Object.entries(node.toggle))
              if ('test' in v) checkGuard(ctx, env, v.test, at(pointer, 'toggle', name, 'test'))
            sends(node.on)
            return
          case 'widget':
          case 'global':
            sends(node.on)
            return
          case 'if':
            checkGuard(ctx, env, node.test, at(pointer, 'test'))
            return
          case 'query':
            checkValue(
              ctx,
              f.id,
              node.input,
              effectSchemas(ir, node.query)?.input ?? null,
              at(pointer, 'input'),
              `input of ${node.query}`,
            )
            return
          default:
            return
        }
      })
  }
}
