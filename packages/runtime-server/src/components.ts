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
