import { type ProjectIR, usedClientComponents } from '@hozu/core/ir'

export function assertComponentBundle(ir: ProjectIR, urls: Record<string, string>, given: boolean) {
  const missing = usedClientComponents(ir).filter((ref) => !urls[ref])
  if (!missing.length) return
  throw new Error(
    given
      ? `The component bundle has no client code for ${missing.join(', ')}; check the diagnostics of bundleComponents (HZ029).`
      : `Client components ${missing.join(', ')} are used in views, but no component bundle was given, so their client code would never load. Pass \`components: await bundleComponents(build)\` from @hozu/bundle (npm install @hozu/bundle), or serve the output of \`hozu build\`.`,
  )
}

/** Features whose effects run in the browser need their fetch bundle (ADR 0049), or those effects never load. */
export function assertFetchBundle(ir: ProjectIR, urls: Record<string, string>, given: boolean) {
  const missing = Object.values(ir.features)
    .filter(
      (f) =>
        f.fetch &&
        [...Object.values(f.queries), ...Object.values(f.mutations)].some((e) => e.runs !== 'server') &&
        !urls[f.id],
    )
    .map((f) => f.id)
  if (!missing.length) return
  throw new Error(
    given
      ? `The bundle has no fetch module for ${missing.join(', ')}; check the diagnostics of bundleComponents (HZ081).`
      : `Features ${missing.join(', ')} have effects that run in the browser, but no bundle was given, so their fetch.ts would never load. Pass \`components: await bundleComponents(build)\` from @hozu/bundle (npm install @hozu/bundle), or serve the output of \`hozu build\`.`,
  )
}
