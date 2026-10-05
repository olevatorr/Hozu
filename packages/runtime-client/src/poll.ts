/** Reads the polled queries again on their timers while the page is visible (ADR 0063 C1). */
export const poll = (
  doc: Document,
  every: Record<string, number>,
  refresh: (refs: string[]) => Promise<void>,
) => {
  const groups = new Map<number, string[]>()
  for (const [ref, seconds] of Object.entries(every))
    groups.set(seconds, [...(groups.get(seconds) ?? []), ref])
  for (const [seconds, refs] of groups)
    setInterval(() => {
      if (doc.visibilityState !== 'hidden') void refresh(refs)
    }, seconds * 1000)
}
