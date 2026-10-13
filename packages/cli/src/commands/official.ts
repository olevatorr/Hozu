import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { DevOfficial } from '@hozu/core/ir'

export const OFFICIAL = '@hozu/ui-kit'

export interface Catalog {
  kit: string
  styles: string
  themes: string[]
  files: Record<string, { components: string[]; uses: string[] }>
}

export interface Official {
  dir: string
  version: string
  catalog: Catalog
}

export interface KitLock {
  source: typeof OFFICIAL
  version: string
  /** The theme keeps Tailwind's palette, radii and shadows while the app's own classes still use them. */
  partial?: boolean
  files: Record<string, string>
}

const RESETS = /^[ \t]*--(?:color|radius|shadow|font)-\*: initial;\n/gm
const COLOURS =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black'
const TAILWIND_THEMED = new RegExp(
  `^(?:[\\w-]+:)*(?:(?:bg|text|border|ring|fill|stroke|outline|divide|from|via|to|shadow|accent|caret|decoration|placeholder)(?:-[xytrbl])?-(?:${COLOURS})(?:-\\d{2,3})?(?:/\\d+)?|rounded(?:-[a-z]{1,2})?-(?:xs|sm|md|lg|xl|2xl|3xl|4xl)|rounded-(?:xs|sm|md|lg|xl|2xl|3xl|4xl)|shadow-(?:2xs|xs|sm|md|lg|xl|2xl))!?$`,
)

/** The app's classes that need Tailwind's own palette, radii or shadows, which the kit's strict theme removes. */
export const tailwindThemed = (classes: Iterable<string>) =>
  [...classes].filter((c) => TAILWIND_THEMED.test(c)).sort()

const themed = (official: Official, lock: KitLock, file: string, text: string) =>
  lock.partial && file === official.catalog.styles ? text.replace(RESETS, '') : text

const hash = (text: string) => createHash('sha256').update(text).digest('hex')

/** The installed `@hozu/ui-kit` the app at `from` resolves, or null. */
export function officialPackage(from: string): Official | null {
  try {
    const catalogFile = createRequire(from).resolve(`${OFFICIAL}/catalog.json`)
    const dir = dirname(catalogFile)
    const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }
    return { dir, version, catalog: JSON.parse(readFileSync(catalogFile, 'utf8')) as Catalog }
  } catch {
    return null
  }
}

export const lockPath = (root: string, id: string) => join(root, id, 'kit.lock.json')

export function readLock(root: string, id: string): KitLock | null {
  try {
    return JSON.parse(readFileSync(lockPath(root, id), 'utf8')) as KitLock
  } catch {
    return null
  }
}

export function writeLock(root: string, id: string, lock: KitLock) {
  const files = Object.fromEntries(Object.entries(lock.files).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(lockPath(root, id), `${JSON.stringify({ ...lock, files }, null, 2)}\n`)
}

/** The files a component lives in, with every file they use. */
export function closure(catalog: Catalog, files: string[]): string[] {
  const out = new Set<string>()
  const visit = (file: string) => {
    if (out.has(file) || !catalog.files[file]) return
    out.add(file)
    for (const used of catalog.files[file]!.uses) visit(used)
  }
  for (const file of files) visit(file)
  return [...out].sort()
}

export const fileOf = (catalog: Catalog, component: string): string | null =>
  Object.entries(catalog.files).find(([, f]) => f.components.includes(component))?.[0] ?? null

export const kitSource = (official: Official, id: string) =>
  readFileSync(join(official.dir, 'kit', official.catalog.kit), 'utf8').replace(
    /\bid: '[^']*'/,
    `id: '${id}'`,
  )

const moduleName = (file: string) =>
  file.replace(/\.ts$/, '').replace(/-(\w)/g, (_, c: string) => c.toUpperCase())

/** `kit.ts` with the module of `file` imported and listed, or null when it cannot be edited safely. */
export function withModule(source: string, file: string): string | null {
  const name = moduleName(file)
  if (new RegExp(`from '\\./${file.replace('.', '\\.')}'`).test(source)) return source
  const list = /components:\s*\[([^\]]*)\]/.exec(source)
  if (!list) return null
  const imports = [...source.matchAll(/^import .*$/gm)]
  const at = imports.length ? imports.at(-1)!.index! + imports.at(-1)![0].length + 1 : 0
  const entries = list[1]!.trim()
  const listed = source.replace(list[0], `components: [${entries ? `${entries}, ` : ''}${name}]`)
  return `${listed.slice(0, at)}import * as ${name} from './${file}'\n${listed.slice(at)}`
}

/** Copies `files` of the official kit into `<root>/<id>/`; a file that exists with other content is kept. */
export function copyFiles(
  official: Official,
  root: string,
  id: string,
  files: string[],
  lock: KitLock,
): { written: string[]; kept: string[] } {
  const written: string[] = []
  const kept: string[] = []
  for (const file of files) {
    const text = themed(official, lock, file, readFileSync(join(official.dir, 'kit', file), 'utf8'))
    const target = join(root, id, file)
    if (existsSync(target)) {
      if (readFileSync(target, 'utf8') !== text) {
        kept.push(file)
        continue
      }
    } else {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, text)
      written.push(file)
    }
    lock.files[file] = hash(text)
  }
  return { written, kept }
}

/** Updates the files still as installed to the package's version; lists the ones changed in the app. */
export function syncFiles(
  official: Official,
  root: string,
  id: string,
  lock: KitLock,
): { updated: string[]; edited: string[] } {
  const updated: string[] = []
  const edited: string[] = []
  for (const file of Object.keys(lock.files)) {
    const source = join(official.dir, 'kit', file)
    const target = join(root, id, file)
    if (!existsSync(source) || !existsSync(target)) continue
    const next = themed(official, lock, file, readFileSync(source, 'utf8'))
    const local = readFileSync(target, 'utf8')
    if (local === next) {
      lock.files[file] = hash(next)
      continue
    }
    if (hash(next) === lock.files[file]) continue
    if (hash(local) !== lock.files[file]) {
      edited.push(file)
      continue
    }
    writeFileSync(target, next)
    lock.files[file] = hash(next)
    updated.push(file)
  }
  lock.version = official.version
  return { updated, edited }
}

export const allFiles = (catalog: Catalog) =>
  [...closure(catalog, Object.keys(catalog.files)), catalog.styles].sort()

/** The kit installed from `@hozu/ui-kit` and the package's components, for DevTools (ADR 0089 P4). */
export function officialState(root: string, kits: string[]): DevOfficial {
  const kit = kits.find((id) => readLock(root, id)?.source === OFFICIAL) ?? null
  const lock = kit ? readLock(root, kit) : null
  const official = officialPackage(join(root, 'hozu.config.ts'))
  return {
    kit,
    version: lock?.version ?? official?.version ?? null,
    partial: !!lock?.partial,
    available: official
      ? Object.entries(official.catalog.files).flatMap(([file, f]) =>
          f.components.map((name) => ({ name, file })),
        )
      : [],
  }
}
