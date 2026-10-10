export const operators = [
  '%truthy',
  '%cond',
  '%coalesce',
  '%concat',
  '%length',
  '%plus',
  '%minus',
  '%times',
  '%includes',
  '%merge',
] as const

export type Operator = (typeof operators)[number]

export const unimplementedOperators: readonly Operator[] = []
