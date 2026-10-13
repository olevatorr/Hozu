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

const TABLE = `import { ui } from '@hozu/core'
import { tv } from './tv.ts'

export const Table = ui.component({
  tag: 'div',
  styles: tv({ slots: { base: 'overflow-x-auto', table: 'w-full text-left text-sm' } }),
  slots: ['head'],
  children: true,
  render: ({ slots, children, classes }) =>
    ui.div({}, [ui.table({ class: classes.table }, [ui.thead({}, [slots.head]), ui.tbody({}, children)])]),
})

export const Th = ui.component({
  tag: 'th',
  styles: tv({ base: 'px-3 py-2 text-xs font-medium' }),
  children: true,
  render: ({ children }) => ui.th({ scope: 'col' }, children),
})

export const Td = ui.component({
  tag: 'td',
  styles: tv({ base: 'px-3 py-2' }),
  children: true,
  render: ({ children }) => ui.td({}, children),
})

export const Tr = ui.component({
  tag: 'tr',
  styles: tv({ base: 'border-t' }),
  children: true,
  render: ({ children }) => ui.tr({}, children),
})
`

const ICON = `import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

export const Icon = ui.component({
  tag: 'svg',
  styles: tv({ base: 'size-4 shrink-0 fill-none stroke-current' }),
  props: z.object({ d: z.string() }),
  render: ({ props }) =>
    ui.svg({ viewBox: '0 0 24 24', 'stroke-width': '2', 'aria-hidden': 'true' }, [ui.path({ d: props.d })]),
})
`

const PREVIEWS = `import { ui } from '@hozu/core'
import { previews } from '@hozu/core/preview'
import { Badge } from './badge.ts'
import { Table, Td, Th, Tr } from './table.ts'

export default previews((p) => [
  p.example(Table, 'Orders', () =>
    ui.use(Table, { slots: { head: ui.use(Tr, {}, [ui.use(Th, {}, ['Order']), ui.use(Th, {}, ['Status'])]) } }, [
      ui.use(Tr, {}, [ui.use(Td, {}, ['#1042']), ui.use(Td, {}, [ui.use(Badge, { props: { tone: 'done' } }, ['Paid'])])]),
      ui.use(Tr, {}, [ui.use(Td, {}, ['#1041']), ui.use(Td, {}, ['Pending'])]),
      ui.use(Tr, {}, [ui.use(Td, {}, ['#1040']), ui.use(Td, {}, ['Refunded'])]),
    ]),
  ),
])
`

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
      previews: 'previews.ts',
      parts: { Table: ['Tr', 'Th', 'Td'] },
      pickers: { Icon: { prop: 'd', from: ['icons/lucide.ts'] } },
      files: {
        'badge.ts': { components: ['Badge'], uses: [] },
        'button.ts': { components: ['Button'], uses: [] },
        'dialog.ts': { components: ['Dialog'], uses: [] },
        'table.ts': { components: ['Table', 'Th', 'Td', 'Tr'], uses: [] },
        'icon.ts': { components: ['Icon'], uses: [] },
        'icons/lucide.ts': { components: [], uses: [] },
      },
    }),
  )
  writeFileSync(join(root, 'ui/table.ts'), TABLE)
  writeFileSync(join(root, 'ui/icon.ts'), ICON)
  mkdirSync(join(root, 'ui/icons'))
  writeFileSync(
    join(root, 'ui/icons/lucide.ts'),
    readFileSync(join(repo, 'packages/cli/test/fixtures/hozu-ui-kit/kit/icons/lucide.ts'), 'utf8'),
  )
  writeFileSync(join(root, 'ui/previews.ts'), PREVIEWS)
  writeFileSync(
    join(root, 'hozu.config.ts'),
    readFileSync(join(root, 'hozu.config.ts'), 'utf8').replace(
      '  features: [tasks],',
      "  previews: [new URL('./ui/previews.ts', import.meta.url)],\n  features: [tasks],",
    ),
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
        "import * as input from './input.ts'\nimport * as tag from './tag.ts'\nimport * as table from './table.ts'\nimport * as icon from './icon.ts'",
      )
      .replace('input, field]', 'input, field, tag, table, icon]'),
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
