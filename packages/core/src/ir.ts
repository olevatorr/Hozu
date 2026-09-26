export type { Manifest, ManifestAsset } from './build/manifest.ts'
export type { BuildOptions, BuildResult } from './build/project.ts'
export { buildProject, UNEXPECTED_ERROR_SCHEMA } from './build/project.ts'
export { hashJson, sha256, sha256Bytes } from './canonical/hash.ts'
export type { At } from './canonical/pointer.ts'
export { at, join, parsePointer, pointer, resolveAt, resolveSource } from './canonical/pointer.ts'
export { canonicalStringify } from './canonical/stringify.ts'
export { i18nFns, placeholders } from './i18n/runtime.ts'
export type * from './ir/bindings.ts'
export { classCandidates, motionClasses } from './ir/classes.ts'
export type { CodeInfo } from './ir/codes.ts'
export { codes } from './ir/codes.ts'
export type * from './ir/diagnostic.ts'
export {
  attrValues,
  htmlGlobalAttrs,
  htmlTags,
  svgGlobalAttrs,
  svgTags,
  tagAttrs,
  voidTags,
} from './ir/dom-data.ts'
export { domEvents, eventFields, passiveEvents } from './ir/events.ts'
export { FORM_FIELD, formRunnable } from './ir/forms.ts'
export { anyGuardRef, anyRef, eachGuardRef, eachRef, type RefExpr } from './ir/refs.ts'
export { localeOf, publicPath, routeTable, searchDefaults } from './ir/routes.ts'
export type * from './ir/types.ts'
