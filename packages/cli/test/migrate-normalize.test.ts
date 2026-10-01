import { describe, expect, it } from 'vitest'
import { type Counts, differences, normalize07, normalize08 } from '../src/commands/migrate-normalize.ts'

const ctx = (...path: string[]) => ({ ref: 'context', path })
const truthy = (v: unknown) => ({ op: 'fn', fn: '%truthy', arg: { object: { v } } })

const ir07 = () => ({
  irVersion: 1,
  routes: {
    home: {
      path: '/',
      params: null,
      search: { properties: { show: { type: 'string', default: 'all' }, tag: { type: ['string', 'null'] } } },
    },
  },
  pages: {
    home: { head: { query: { ref: 'f.me', input: { literal: {} } }, redirects: { Unauthorized: 'login' } } },
    login: { head: { query: null, redirects: {} } },
  },
  features: {
    f: {
      exports: { queries: [] },
      endpoints: { api: { output: 's1' }, raw: { output: null } },
      queries: {
        me: { scope: 'user', freshness: { kind: 'static' }, errors: { Unauthorized: 's', Gone: 's' } },
        list: { scope: 'user', freshness: { kind: 'swr', seconds: 30 }, errors: {} },
        live: { scope: 'user', freshness: { kind: 'live' }, errors: {} },
        pub: { scope: 'public', freshness: { kind: 'revalidate', seconds: 60 }, errors: {} },
      },
      machine: {
        states: {
          idle: {
            on: {
              'f.More': [
                {
                  guard: {
                    op: 'and',
                    args: [{ op: 'and', args: [truthy(ctx('a')), truthy(ctx('b'))] }, truthy(ctx('c'))],
                  },
                  assign: [{ op: 'inc', path: ['n'], value: { literal: 5 } }],
                  navigate: {
                    link: 'home',
                    params: { literal: null },
                    search: { literal: { show: 'all', tag: null } },
                  },
                },
                { guard: truthy({ fn: 'f.ok', arg: { literal: null } }) },
                {
                  guard: {
                    op: 'fn',
                    fn: '%cond',
                    arg: { object: { c: { test: truthy(ctx('a')) }, a: ctx('b'), b: { literal: false } } },
                  },
                },
              ],
            },
          },
        },
      },
      views: {
        V: {
          root: {
            id: 'f.V',
            kind: 'el',
            tag: 'div',
            attrs: {},
            children: [
              { id: 'f.V/0', kind: 'el', tag: 'form', attrs: { id: { literal: 'bulk' } }, children: [] },
              { id: 'f.V/1', kind: 'el', tag: 'input', attrs: { form: { literal: 'bulk' } }, children: [] },
              { id: 'f.V/2', kind: 'el', tag: 'form', attrs: { id: { literal: 'alone' } }, children: [] },
              {
                id: 'f.V/3',
                kind: 'el',
                tag: 'a',
                attrs: {
                  href: {
                    link: 'home',
                    params: { literal: null },
                    search: { object: { show: ctx('s'), tag: { literal: null } } },
                  },
                },
                children: [],
              },
            ],
          },
        },
      },
    },
  },
})

describe('normalize07: the 0.7 IR in 0.8 terms', () => {
  it('maps every allowed difference and counts it', () => {
    const counts: Counts = {}
    const ir = normalize07(ir07(), counts)
    expect(ir.irVersion).toBe(2)
    expect(ir.features.f.exports).toEqual({ queries: [], endpoints: [] })
    expect(ir.features.f.endpoints.api.mode).toBe('json')
    expect(ir.features.f.endpoints.raw.mode).toBe('response')
    expect(ir.pages.home.head).toEqual({
      query: { ref: 'f.me', input: { literal: {} } },
      failed: { Unauthorized: { redirect: 'login' }, Gone: { status: 404 } },
    })
    expect(ir.pages.login.head).toEqual({ query: null, failed: {} })
    const q = ir.features.f.queries
    expect([q.me.freshness, q.list.freshness, q.live.freshness, q.pub.freshness]).toEqual([
      { kind: 'request' },
      { kind: 'request' },
      { kind: 'live' },
      { kind: 'revalidate', seconds: 60 },
    ])
    const [more, ok, cond] = ir.features.f.machine.states.idle.on['f.More']
    expect(more.guard).toEqual({ op: 'and', args: [truthy(ctx('a')), truthy(ctx('b')), truthy(ctx('c'))] })
    expect(more.assign).toEqual([
      { op: 'set', path: ['n'], value: { fn: '%plus', arg: { object: { a: ctx('n'), b: { literal: 5 } } } } },
    ])
    expect(more.navigate.search).toEqual({ literal: null })
    expect(ok.guard).toEqual({ op: 'fn', fn: 'f.ok', arg: { literal: null } })
    expect(cond.guard).toEqual({ op: 'and', args: [truthy(ctx('a')), truthy(ctx('b'))] })
    const [form, input, alone, link] = ir.features.f.views.V.root.children
    expect([form.attrs.id, form.ref, input.attrs.form]).toEqual([
      { formRef: 'f.V/0' },
      { formRef: 'f.V/0' },
      { formRef: 'f.V/0' },
    ])
    expect([alone.attrs.id, alone.ref]).toEqual([{ literal: 'alone' }, undefined])
    expect(link.attrs.href.search).toEqual({ object: { show: ctx('s') } })
    expect(counts).toEqual({
      irVersion: 1,
      exportsEndpoints: 1,
      endpointMode: 2,
      freshness: 2,
      formRef: 1,
      headFailed: 1,
      headFailed404: 1,
      andOr: 1,
      incPlus: 1,
      linkFolding: 2,
      truthyCall: 1,
      condGuard: 1,
    })
  })

  it('is idempotent, and differences() reports pointers regardless of key order', () => {
    const once = normalize07(ir07())
    const counts: Counts = {}
    expect(differences(normalize07(once, counts), once)).toEqual([])
    expect(counts).toEqual({})
    expect(differences({ a: { x: 1, y: [1, 2] } }, { a: { y: [1, 3], x: 1 } })).toEqual(['/a/y/1'])
    expect(differences({ 'a/b': 1 }, { 'a/b': 2 })).toEqual(['/a~1b'])
  })
})

describe('normalize08: the 0.8 IR in 0.9 terms (ADR 0045 phase 1)', () => {
  it('sets irVersion 3 and the empty kits and components, idempotently', () => {
    const once = normalize08(normalize07(ir07()))
    expect(once.irVersion).toBe(3)
    expect(once.kits).toEqual({})
    expect(Object.values(once.features).map((f: any) => f.components)).toEqual([{}])
    expect(differences(normalize08(once), once)).toEqual([])
  })
})
