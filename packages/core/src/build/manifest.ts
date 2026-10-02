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
}
