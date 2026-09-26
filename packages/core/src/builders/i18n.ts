import { placeholders } from '../i18n/runtime.ts'
import { brand, type Decl } from '../model/decl.ts'
import { createRef, EXPR, type Expr, type Val } from '../model/expr.ts'
import type { Href } from './ui.ts'

type Trim<S extends string> = S extends ` ${infer T}` ? Trim<T> : S extends `${infer T} ` ? Trim<T> : S

type Skip<S extends string, D extends unknown[]> = S extends `${infer C}${infer R}`
  ? C extends '{'
    ? Skip<R, [...D, 0]>
    : C extends '}'
      ? D extends [unknown, ...infer T]
        ? T extends []
          ? R
          : Skip<R, T>
        : R
      : Skip<R, D>
  : ''

type Arg<S extends string> = S extends `${string}{${infer Rest}`
  ? Rest extends `${infer N}}${infer After}`
    ? N extends `${infer M},${string}`
      ? Trim<M> | Arg<Skip<Rest, [0]>>
      : Trim<N> | Arg<After>
    : never
  : never

export type Message<S extends string> = [Arg<S>] extends [never]
  ? Expr<string>
  : (args: { readonly [K in Arg<S>]: Val<string | number | null> }) => Expr<string>

export type MessagesDecl<M = Record<string, string>> = Decl<'messages'> & {
  readonly [K in keyof M]: M[K] extends string ? Message<M[K]> : never
}

export interface MessagesDef {
  base: string
  text: Record<string, Record<string, string>>
}

const keys = new WeakMap<object, { decl: object; key: string }>()
const builtins = new WeakMap<object, string>()

export const messageKeyOf = (fn: object) => keys.get(fn) ?? null
export const builtinOf = (fn: object) => builtins.get(fn) ?? null

export function messages<const D extends string, const M extends Record<string, string>>(
  base: D,
  all: { [K in D]: M } & Record<string, { [K in keyof M]: string }>,
): MessagesDecl<M> {
  const decl: Record<string, unknown> = {}
  const markers: [object, string][] = []
  for (const [key, template] of Object.entries((all as Record<string, Record<string, string>>)[base] ?? {})) {
    const marker = {}
    markers.push([marker, key])
    const call = (arg: unknown) => Object.freeze({ [EXPR]: { kind: 'call', fn: marker, arg } })
    decl[key] = placeholders(template).length ? call : call(null)
  }
  const branded = brand(decl, 'messages', { base, text: all } satisfies MessagesDef)
  for (const [marker, key] of markers) keys.set(marker, { decl: branded, key })
  return branded as MessagesDecl<M>
}

const builtin = (name: string) => {
  const marker = {}
  builtins.set(marker, name)
  return (arg: unknown): Expr<string> => Object.freeze({ [EXPR]: { kind: 'call', fn: marker, arg } }) as never
}

type NumberOptions = Pick<
  Intl.NumberFormatOptions,
  | 'style'
  | 'currency'
  | 'currencyDisplay'
  | 'unit'
  | 'unitDisplay'
  | 'notation'
  | 'compactDisplay'
  | 'signDisplay'
  | 'minimumFractionDigits'
  | 'maximumFractionDigits'
  | 'useGrouping'
>
type DateOptions = Pick<
  Intl.DateTimeFormatOptions,
  'dateStyle' | 'timeStyle' | 'year' | 'month' | 'day' | 'weekday' | 'hour' | 'minute' | 'timeZone'
>
type ListOptions = Pick<Intl.ListFormatOptions, 'type' | 'style'>

const number = builtin('#number')
const date = builtin('#date')
const relative = builtin('#relative')
const list = builtin('#list')
const og = builtin('#og')

export const openGraph = (card: { title: Val<string>; subtitle?: Val<string | null> }): Expr<string> =>
  og({ title: card.title, subtitle: card.subtitle ?? null })

export const format = Object.freeze({
  number: (value: Val<number | null>, options: NumberOptions = {}): Expr<string> =>
    number({ v: value, o: options }),
  date: (value: Val<string | number | null>, options: DateOptions = {}): Expr<string> =>
    date({ v: value, o: options }),
  relative: (value: Val<number | null>, unit: Intl.RelativeTimeFormatUnit): Expr<string> =>
    relative({ v: value, u: unit }),
  list: (value: Expr<readonly string[]>, options: ListOptions = {}): Expr<string> =>
    list({ v: value, o: options }),
})

export const alternate = (locale: string): Href => createRef('alternate', 0, [locale])
