import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const studio = fileURLToPath(new URL('../../../examples/studio/', import.meta.url))
const repo = fileURLToPath(new URL('../../../', import.meta.url))

/** The studio app with its `ui` kit installed from a small `@hozu/ui-kit` (ADR 0089 P4–P6). */
export function appWithHozuUi(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'hozu-devtools-ui-')))
  cpSync(studio, root, { recursive: true, filter: (from) => !/[/\\](node_modules|\.hozu)$/.test(from) })
  writeFileSync(
    join(root, 'tsconfig.json'),
    readFileSync(join(studio, 'tsconfig.json'), 'utf8').replace(
      '../../tsconfig.base.json',
      join(repo, 'tsconfig.base.json'),
    ),
  )
  const modules = join(studio, 'node_modules')
  mkdirSync(join(root, 'node_modules/@hozu'), { recursive: true })
  for (const name of readdirSync(modules).filter((n) => n !== '@hozu'))
    symlinkSync(realpathSync(join(modules, name)), join(root, 'node_modules', name))
  for (const name of readdirSync(join(modules, '@hozu')))
    symlinkSync(realpathSync(join(modules, '@hozu', name)), join(root, 'node_modules/@hozu', name))
  const kit = join(root, 'node_modules/@hozu/ui-kit')
  mkdirSync(kit)
  writeFileSync(join(kit, 'package.json'), JSON.stringify({ name: '@hozu/ui-kit', version: '0.1.0' }))
  writeFileSync(
    join(kit, 'catalog.json'),
    JSON.stringify({
      kit: 'kit.ts',
      styles: 'theme.css',
      themes: [],
      files: {
        'badge.ts': { components: ['Badge'], uses: [] },
        'button.ts': { components: ['Button'], uses: [] },
        'dialog.ts': { components: ['Dialog'], uses: [] },
      },
    }),
  )
  writeFileSync(
    join(root, 'ui/tag.ts'),
    `import { ui } from '@hozu/core'\nimport { tv } from './tv.ts'\n\nexport const Tag = ui.component({\n  tag: 'span',\n  styles: tv({ base: 'rounded-full px-2 text-xs' }),\n  children: true,\n  render: ({ children }) => ui.span({}, children),\n})\n`,
  )
  writeFileSync(
    join(root, 'ui/kit.ts'),
    readFileSync(join(root, 'ui/kit.ts'), 'utf8')
      .replace(
        "import * as input from './input.ts'",
        "import * as input from './input.ts'\nimport * as tag from './tag.ts'",
      )
      .replace('input, field]', 'input, field, tag]'),
  )
  writeFileSync(
    join(root, 'ui/button.ts'),
    readFileSync(join(root, 'ui/button.ts'), 'utf8').replace(
      "md: 'px-4 py-2 text-sm' }",
      "md: 'px-4 py-2 text-sm', icon: 'size-8 text-sm' }",
    ),
  )
  writeFileSync(
    join(root, 'ui/kit.lock.json'),
    JSON.stringify({ source: '@hozu/ui-kit', version: '0.1.0', files: {} }),
  )
  return root
}

export const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })
