export interface ManifestAsset {
  name: string
  href: string
  width: number | null
  height: number | null
}

export interface Manifest {
  irHash: string
  assets: ManifestAsset[]
  widgets: Record<string, { hash: string; url: string }>
  styles: { href: string; preload: string[] } | null
}
