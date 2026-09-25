import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type BuildResult, classCandidates, sha256 } from '@tenon/core/ir'

interface CssModule {
  compileStyles(
    build: BuildResult,
    options: { minify: boolean; base: string },
  ): Promise<{ unknown: Map<string, string | null>; files: string[] }>
}

interface Cache {
  key: string
  files: string[]
  unknown: [string, string | null][]
}

const keyOf = (build: BuildResult, files: string[]) =>
  sha256(
    JSON.stringify([
      [...classCandidates(build.ir)].sort(),
      build.bindings.styles,
      files.map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : null)),
    ]),
  )

export async function unknownClasses(configPath: string, build: BuildResult) {
  const base = dirname(configPath)
  const cacheFile = join(base, 'node_modules/.cache/tenon/styles.json')
  const cached = existsSync(cacheFile) ? (JSON.parse(readFileSync(cacheFile, 'utf8')) as Cache) : null
  if (cached && cached.key === keyOf(build, cached.files)) return new Map(cached.unknown)
  let css: CssModule
  try {
    css = (await import(pathToFileURL(createRequire(configPath).resolve('@tenon/css')).href)) as CssModule
  } catch {
    return null
  }
  const { unknown, files } = await css.compileStyles(build, { minify: false, base })
  try {
    mkdirSync(dirname(cacheFile), { recursive: true })
    const entry: Cache = { key: keyOf(build, files), files, unknown: [...unknown] }
    writeFileSync(cacheFile, JSON.stringify(entry))
  } catch {}
  return unknown
}
