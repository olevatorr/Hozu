import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export const UI_KIT = '@hozu/ui-kit'

interface Catalog {
  kit: string
  styles: string
  tv: string
  files: Record<string, { components: string[]; uses: string[] }>
}

/** The unpacked `@hozu/ui-kit`: a folder or tarball named by HOZU_UI_KIT, else the latest from npm. */
export function fetchUiKit(source = process.env.HOZU_UI_KIT): string {
  if (source && existsSync(join(source, 'catalog.json'))) return source
  if (source && !(source.endsWith('.tgz') && existsSync(source)))
    throw new Error(`HOZU_UI_KIT names ${source}, which is neither an unpacked ${UI_KIT} nor its .tgz`)
  const scratch = mkdtempSync(join(tmpdir(), 'create-hozu-ui-'))
  const tarball =
    source && source.endsWith('.tgz')
      ? source
      : join(
          scratch,
          execFileSync('npm', ['pack', `${UI_KIT}@latest`, '--pack-destination', scratch, '--silent'], {
            encoding: 'utf8',
            shell: process.platform === 'win32',
          })
            .trim()
            .split('\n')
            .at(-1)!,
        )
  execFileSync('tar', ['-xzf', tarball, '-C', scratch])
  const unpacked = join(scratch, 'package')
  if (!existsSync(join(unpacked, 'catalog.json')))
    throw new Error(`${UI_KIT} could not be unpacked (${readdirSync(scratch).join(', ')})`)
  return unpacked
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex')

/** Copies the whole kit into `<app>/ui` with its lock, as `hozu add kit ui --from official` would. */
export async function installUi(
  app: string,
  kitDir: string,
): Promise<{ version: string; written: string[] }> {
  const catalog = JSON.parse(await readFile(join(kitDir, 'catalog.json'), 'utf8')) as Catalog
  const { version } = JSON.parse(await readFile(join(kitDir, 'package.json'), 'utf8')) as { version: string }
  const files = [...Object.keys(catalog.files), catalog.styles].sort()
  const lock: Record<string, string> = {}
  const written: string[] = []
  const put = async (rel: string, text: string) => {
    const target = join(app, 'ui', rel)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, text)
    written.push(`ui/${rel}`)
  }
  for (const file of files) {
    const text = await readFile(join(kitDir, 'kit', file), 'utf8')
    await put(file, text)
    lock[file] = hash(text)
  }
  await put(
    catalog.kit,
    (await readFile(join(kitDir, 'kit', catalog.kit), 'utf8')).replace(/\bid: '[^']*'/, "id: 'ui'"),
  )
  await put('tv.ts', await readFile(join(kitDir, 'kit', catalog.tv), 'utf8'))
  await put('kit.lock.json', `${JSON.stringify({ source: UI_KIT, version, files: lock }, null, 2)}\n`)
  return { version, written }
}
