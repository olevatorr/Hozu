import {
  type AssignOp,
  type At,
  at,
  type GuardExpr,
  type JsonSchema,
  type RefSource,
  resolveAt,
  type ValueExpr,
} from '@tenon/core/ir'
import type { Ctx } from '../context.ts'
import { contextEnv, type Env, schemaIn, triggerEnv, valueSchema } from '../env.ts'
import { itemsOf, resolvePath } from '../schema.ts'
import { closest, didYouMean } from '../suggest.ts'
import { featurePointer, transitionsOf, walkView } from '../walk.ts'

function checkPath(
  ctx: Ctx,
  env: Env,
  base: JsonSchema | null,
  path: readonly string[],
  pointer: At,
  label: string,
) {
  const r = resolvePath(base, path)
  if (r.ok) return
  const guess = closest(r.segment, r.candidates)
  ctx.report(
    'TN008',
    env.feature.id,
    at(pointer, 'path', r.index),
    `"${r.segment}" does not exist on ${label}${r.index ? `.${path.slice(0, r.index).join('.')}` : ''}.${didYouMean(guess)}`,
    r.candidates.length ? `Available: ${r.candidates.join(', ')}.` : 'This value has no properties.',
    {
      summary: guess ? `Use "${guess}"` : 'Reference an existing property',
      snippet: null,
      patch: guess ? [{ op: 'replace', path: resolveAt(at(pointer, 'path', r.index)), value: guess }] : null,
    },
  )
}

function checkValue(ctx: Ctx, env: Env, value: ValueExpr, pointer: At) {
  if ('object' in value) {
    for (const [k, v] of Object.entries(value.object)) checkValue(ctx, env, v, at(pointer, 'object', k))
    return
  }
  if ('fn' in value) {
    checkValue(ctx, env, value.arg, at(pointer, 'arg'))
    return
  }
  if ('test' in value) {
    checkGuard(ctx, env, value.test, at(pointer, 'test'))
    return
  }
  if ('link' in value) {
    checkValue(ctx, env, value.params, at(pointer, 'params'))
    return
  }
  if (!('ref' in value) || value.ref === 'dom') return
  if (value.ref === 'binding') {
    if (value.depth < env.bindings.length)
      checkPath(ctx, env, env.bindings[value.depth]!, value.path, pointer, 'the binding')
    else
      ctx.report(
        'TN008',
        env.feature.id,
        at(pointer, 'depth'),
        `Binding ${value.depth} is out of scope`,
        `Only ${env.bindings.length} each/query bindings enclose this value.`,
      )
    return
  }
  if (Object.hasOwn(env.sources, value.ref)) {
    checkPath(ctx, env, env.sources[value.ref]!, value.path, pointer, value.ref)
    return
  }
  const available = Object.keys(env.sources) as RefSource[]
  const alternative = available.find(
    (s) => resolvePath(env.sources[s] ?? null, value.path).ok && env.sources[s] !== undefined,
  )
  ctx.report(
    'TN008',
    env.feature.id,
    at(pointer, 'ref'),
    `"${value.ref}" is not available here`,
    `Available sources: ${available.join(', ') || 'none'}.`,
    {
      summary: alternative ? `Read it from ${alternative}` : 'Use an available source',
      snippet: null,
      patch: alternative
        ? [{ op: 'replace', path: resolveAt(at(pointer, 'ref')), value: alternative }]
        : null,
    },
  )
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
    case 'fn':
      checkValue(ctx, env, guard.arg, at(pointer, 'arg'))
      return
    default:
      checkValue(ctx, env, guard.left, at(pointer, 'left'))
      checkValue(ctx, env, guard.right, at(pointer, 'right'))
  }
}

function checkAssign(ctx: Ctx, env: Env, op: AssignOp, pointer: At) {
  const context = env.sources.context ?? null
  checkPath(ctx, env, context, op.path, pointer, 'context')
  checkValue(ctx, env, op.value, at(pointer, 'value'))
  if (op.op !== 'removeWhere') return
  const target = resolvePath(context, op.path)
  const item = target.ok ? itemsOf(target.schema) : null
  const r = resolvePath(item, [op.key])
  if (!r.ok) {
    const guess = closest(op.key, r.candidates)
    ctx.report(
      'TN008',
      env.feature.id,
      at(pointer, 'key'),
      `Items of ${op.path.join('.')} have no "${op.key}".${didYouMean(guess)}`,
      `Available: ${r.candidates.join(', ')}.`,
      {
        summary: guess ? `Use "${guess}"` : 'Use an existing key',
        snippet: null,
        patch: guess ? [{ op: 'replace', path: resolveAt(at(pointer, 'key')), value: guess }] : null,
      },
    )
  }
}

export function paths(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features)) {
    for (const [sym, q] of Object.entries(f.queries)) {
      const env: Env = { feature: f, sources: { input: schemaIn(f, q.input) }, bindings: [] }
      q.tags.forEach(
        (t, i) =>
          t.param && checkValue(ctx, env, t.param, featurePointer(f.id, 'queries', sym, 'tags', i, 'param')),
      )
    }
    for (const [sym, m] of Object.entries(f.mutations)) {
      const env: Env = { feature: f, sources: { input: schemaIn(f, m.input) }, bindings: [] }
      m.invalidates.forEach(
        (t, i) =>
          t.param &&
          checkValue(ctx, env, t.param, featurePointer(f.id, 'mutations', sym, 'invalidates', i, 'param')),
      )
    }
    if (f.machine) {
      const base = contextEnv(f)
      for (const [state, s] of Object.entries(f.machine.states))
        if (s.invoke)
          checkValue(
            ctx,
            base,
            s.invoke.input,
            featurePointer(f.id, 'machine', 'states', state, 'invoke', 'input'),
          )
      for (const site of transitionsOf(f)) {
        const env = triggerEnv(ctx, f, site.trigger)
        const t = site.transition
        if (t.guard) checkGuard(ctx, env, t.guard, site.at('guard'))
        t.assign.forEach((a, i) => checkAssign(ctx, env, a, site.at('assign', i)))
      }
    }
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer, env }) => {
        switch (node.kind) {
          case 'widget':
            checkValue(ctx, env, node.props, at(pointer, 'props'))
            for (const key of ['toggle', 'vars'] as const)
              for (const [name, v] of Object.entries(node[key]))
                checkValue(ctx, env, v, at(pointer, key, name))
            for (const [event, send] of Object.entries(node.on))
              checkValue(ctx, env, send.payload, at(pointer, 'on', event, 'payload'))
            return
          case 'el':
            for (const key of ['attrs', 'toggle', 'vars'] as const)
              for (const [name, v] of Object.entries(node[key]))
                checkValue(ctx, env, v, at(pointer, key, name))
            for (const [dom, send] of Object.entries(node.on))
              checkValue(ctx, env, send.payload, at(pointer, 'on', dom, 'payload'))
            return
          case 'text':
          case 'html':
            checkValue(ctx, env, node.value, at(pointer, 'value'))
            return
          case 'if':
            checkGuard(ctx, env, node.test, at(pointer, 'test'))
            return
          case 'global':
            for (const [event, send] of Object.entries(node.on))
              checkValue(ctx, env, send.payload, at(pointer, 'on', event, 'payload'))
            return
          case 'each': {
            checkValue(ctx, env, node.source, at(pointer, 'source'))
            if (node.key === null) return
            const item = itemsOf(valueSchema(ir, env, node.source))
            const r = resolvePath(item, [node.key])
            if (!r.ok) {
              const guess = closest(node.key, r.candidates)
              ctx.report(
                'TN008',
                f.id,
                at(pointer, 'key'),
                `each key "${node.key}" is not a property of the items.${didYouMean(guess)}`,
                `Available: ${r.candidates.join(', ')}.`,
                {
                  summary: guess ? `Use "${guess}"` : 'Key by an existing property',
                  snippet: null,
                  patch: guess
                    ? [{ op: 'replace', path: resolveAt(at(pointer, 'key')), value: guess }]
                    : null,
                },
              )
            }
            return
          }
          case 'query':
            checkValue(ctx, env, node.input, at(pointer, 'input'))
            return
          default:
            return
        }
      })
  }
}
