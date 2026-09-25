export function distance(a: string, b: string): number {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!
      prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return prev[b.length]!
}

export function closest(input: string, candidates: Iterable<string>): string | null {
  const lower = input.toLowerCase()
  let best: string | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const score = candidate.toLowerCase() === lower ? 0 : distance(input, candidate)
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best !== null && bestScore <= Math.max(2, Math.floor(input.length / 3)) ? best : null
}

export const didYouMean = (suggestion: string | null): string =>
  suggestion ? ` Did you mean "${suggestion}"?` : ''
