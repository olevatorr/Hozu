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
  widgets: Record<string, { hash: string; url: string }>
  styles: { href: string; preload: string[] } | null
}
