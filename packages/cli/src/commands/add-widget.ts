import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import type { AddOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { addImport } from './add.ts'

const declaration = (name: string, file: string) => `export const ${name} = ui.widget({
  tag: 'div',
  props: z.object({}),
  events: {},
  client: new URL('./${file}', import.meta.url),
  load: 'visible',
  wraps: false,
})
`

const client = (name: string) => `import { implement } from '@hozu/core/widget'
import type { ${name} } from './widgets.ts'

export default implement<typeof ${name}>(({ el }) => {
  el.dataset.ready = ''
  return { destroy: () => el.replaceChildren() }
})
`

export async function runAddWidget(
  cwd: string,
  config: string | undefined,
  feature: string | undefined,
  name: string | undefined,
): Promise<AddOutput> {
  if (!feature || !name || !/^[A-Z][A-Za-z0-9]*$/.test(name))
    throw new HozuCliError('usage', 'Give the feature and a PascalCase widget name', [
      'hozu add widget stations StationMap',
    ])
  const root = dirname(resolve(cwd, config ?? 'hozu.config.ts'))
  const dir = join(root, 'features', feature)
  if (!existsSync(dir))
    throw new HozuCliError('usage', `features/${feature} does not exist`, [`hozu add feature ${feature}`])
  const out: AddOutput = { created: [], edited: [], manual: [], declarations: { widget: [name] }, texts: [] }
  const file = `${name[0]!.toLowerCase()}${name.slice(1)}.client.ts`
  const write = async (path: string, text: string, created: boolean) => {
    await writeFile(path, text)
    ;(created ? out.created : out.edited).push(relative(cwd, path))
  }
  const widgets = join(dir, 'widgets.ts')
  if (existsSync(join(dir, file)))
    throw new HozuCliError('usage', `features/${feature}/${file} already exists`, [])
  if (existsSync(widgets))
    await write(widgets, `${await readFile(widgets, 'utf8')}\n${declaration(name, file)}`, false)
  else
    await write(
      widgets,
      `import { ui } from '@hozu/core'\nimport { z } from 'zod'\n\n${declaration(name, file)}`,
      true,
    )
  await write(join(dir, file), client(name), true)
  const edit = async (path: string, change: (s: string) => string | null, manual: string) => {
    const source = existsSync(path) ? await readFile(path, 'utf8') : null
    const next = source === null ? null : change(source)
    if (next === null || next === source) out.manual.push(`${relative(cwd, path)}: ${manual}`)
    else await write(path, next, false)
  }
  const host =
    ['views.ts', 'feature.ts'].map((f) => join(dir, f)).find((f) => existsSync(f)) ?? join(dir, 'views.ts')
  await edit(
    host,
    (s) => {
      if (!/declarations: \{\n/.test(s)) return null
      const listed = s.replace(/declarations: \{\n/, `declarations: {\n    ${name},\n`)
      return addImport(listed, `import { ${name} } from './widgets.ts'\n`)
    },
    `import { ${name} } from './widgets.ts' and add ${name} to the feature's declarations`,
  )
  const serve = join(root, 'serve.ts')
  await edit(
    serve,
    (s) => {
      if (/bundleWidgets\s*\(/.test(s)) return s
      const wired = s.replace(
        /(create(?:Server|Handler)\(\{\n)(\s*)/,
        `$1$2widgets: await bundleWidgets(build),\n$2`,
      )
      return wired === s ? null : addImport(wired, "import { bundleWidgets } from '@hozu/bundle'\n")
    },
    "pass widgets: await bundleWidgets(build) to createServer (import { bundleWidgets } from '@hozu/bundle')",
  )
  const pkg = join(root, 'package.json')
  await edit(
    pkg,
    (s) => {
      const json = JSON.parse(s) as { dependencies?: Record<string, string> }
      const deps = json.dependencies ?? {}
      if (deps['@hozu/bundle']) return s
      json.dependencies = Object.fromEntries(
        Object.entries({ ...deps, '@hozu/bundle': deps['@hozu/core'] ?? 'latest' }).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      )
      return `${JSON.stringify(json, null, 2)}\n`
    },
    'add @hozu/bundle to dependencies',
  )
  if (out.edited.includes(relative(cwd, pkg))) out.manual.push('run npm install (adds @hozu/bundle)')
  return out
}

export function describeAddWidget(out: AddOutput, name: string): string {
  return `${[
    ...out.created.map((f) => `created   ${f}`),
    ...out.edited.map((f) => `edited    ${f}`),
    ...out.manual.map((m) => `todo      ${m}`),
    `next      place it in a view: ui.use(${name}, { props: {}, on: {}, class: 'h-64 w-full' }, []); give props in widgets.ts, write the DOM code in the client module (a library's CSS goes in app.css), then hozu check`,
  ].join('\n')}\n`
}
