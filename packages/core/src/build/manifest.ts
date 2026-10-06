export interface ManifestAsset {
  name: string
  href: string
  width: number | null
  height: number | null
}

export interface ImageVariant {
  width: number
  href: string
}

export interface ImageSet {
  variants: Record<string, ImageVariant[]>
  files: Record<string, Uint8Array>
}

export interface Manifest {
  irHash: string
  images: Record<string, ImageVariant[]> | null
  assets: ManifestAsset[]
  components: Record<string, { hash: string; url: string }>
  /** Each feature's fetch module (ADR 0049), by feature id. */
  fetches?: Record<string, { hash: string; url: string }>
  styles: { href: string; preload: string[] } | null
  /**
   * The text fingerprints `hozu build` saw, by component id and by `fn` ref (ADR 0066): a bundler reprints function
   * text, so a build with a manifest reads these instead of hashing the bundled text.
   */
  sources?: { components: Record<string, string>; fns: Record<string, string> }
}
