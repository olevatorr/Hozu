import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type BuildResult, sha256, styledClasses } from '@hozu/core/ir'
import type { ClassStyle } from '@hozu/validator'

interface CssModule {
  compileStyles(
    build: BuildResult,
    options: { minify: boolean; base: string },
  ): Promise<{
    unknown: Map<string, string | null>
    classes: Map<string, ClassStyle>
    tokens: DesignTokens | null
    files: string[]
  }>
}

export interface DesignTokens {
  theme: string[]
  utilities: string[]
  functional: string[]
}

interface Cache {
  key: string
  files: string[]
  unknown: [string, string | null][]
  classes: [string, ClassStyle][]
  tokens: DesignTokens | null
}

export interface ProjectStyles {
  unknown: Map<string, string | null>
  classes: Map<string, ClassStyle>
  tokens: DesignTokens | null
}

const keyOf = (build: BuildResult, files: string[]) =>
  sha256(
    JSON.stringify([
      [...styledClasses(build.ir, build.bindings.components)].sort(),
      build.bindings.styles,
      files.map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : null)),
    ]),
  )

export async function projectStyles(configPath: string, build: BuildResult): Promise<ProjectStyles | null> {
  const base = dirname(configPath)
  const cacheFile = join(base, 'node_modules/.cache/hozu/styles.json')
  let cached: Cache | null = null
  try {
    cached = existsSync(cacheFile) ? (JSON.parse(readFileSync(cacheFile, 'utf8')) as Cache) : null
  } catch {}
  if (cached?.classes && cached.tokens !== undefined && cached.key === keyOf(build, cached.files))
    return { unknown: new Map(cached.unknown), classes: new Map(cached.classes), tokens: cached.tokens }
  let css: CssModule
  try {
    css = (await import(pathToFileURL(createRequire(configPath).resolve('@hozu/css')).href)) as CssModule
  } catch {
    return null
  }
  const { unknown, classes, tokens, files } = await css.compileStyles(build, { minify: false, base })
  try {
    mkdirSync(dirname(cacheFile), { recursive: true })
    const entry: Cache = {
      key: keyOf(build, files),
      files,
      unknown: [...unknown],
      classes: [...classes],
      tokens,
    }
    writeFileSync(cacheFile, JSON.stringify(entry))
  } catch {}
  return { unknown, classes, tokens }
}
