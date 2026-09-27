import { type ProjectIR, usedWidgets } from '@hozu/core/ir'

export function assertWidgetBundle(ir: ProjectIR, urls: Record<string, string>, given: boolean) {
  const missing = usedWidgets(ir).filter((ref) => !urls[ref])
  if (!missing.length) return
  throw new Error(
    given
      ? `The widget bundle has no client code for ${missing.join(', ')}; check the diagnostics of bundleWidgets (HZ029).`
      : `Widgets ${missing.join(', ')} are used in views, but no widget bundle was given, so their client code would never load. Pass \`widgets: await bundleWidgets(build)\` from @hozu/bundle (npm install @hozu/bundle), or serve the output of \`hozu build\`.`,
  )
}
