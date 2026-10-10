import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import type { AddOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { addImport } from './add.ts'

const declaration = (name: string, client: string | null) =>
  client
    ? `export const ${name} = ui.component({
  tag: 'div',
  props: z.object({}),
  emits: {},
  client: new URL('./${client}', import.meta.url),
  load: 'visible',
  render: () => ui.div({}, []),
})
`
    : `export const ${name} = ui.component({
  tag: 'div',
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.div({}, children),
})
`

const clientModule = (name: string, from: string) => `import { implement } from '@hozu/core/component'
import type { ${name} } from './${from}'

export default implement<typeof ${name}>(({ el }) => {
  el.dataset.ready = ''
  return { destroy: () => el.replaceChildren() }
})
`

export const bundleSpec = (core: string | undefined) =>
  core === undefined ? 'latest' : core.startsWith('file:') ? core.replace(/hozu-core-/, 'hozu-bundle-') : core

const lower = (name: string) => `${name[0]!.toLowerCase()}${name.slice(1)}`

export async function runAddComponent(
  cwd: string,
  config: string | undefined,
  owner: string | undefined,
  name: string | undefined,
  client: boolean,
): Promise<AddOutput> {
  if (!owner || !name || !/^[A-Z][A-Za-z0-9]*$/.test(name))
    throw new HozuCliError('usage', 'Give the kit or feature and a PascalCase component name', [
      'hozu add component ui Badge',
      'hozu add component stations StationMap --client',
    ])
  const root = dirname(resolve(cwd, config ?? 'hozu.config.ts'))
  const feature = join(root, 'features', owner)
  const kit = join(root, owner)
  const inFeature = existsSync(feature)
  if (!inFeature && !existsSync(join(kit, 'kit.ts')))
    throw new HozuCliError(
      'usage',
      `${owner} is neither a feature (features/${owner}) nor a kit (${owner}/kit.ts)`,
      [`hozu add kit ${owner}`, `hozu add feature ${owner}`],
    )
  const dir = inFeature ? feature : kit
  const module = inFeature ? 'components.ts' : `${lower(name)}.ts`
  const out: AddOutput = {
    created: [],
    edited: [],
    manual: [],
    declarations: { component: [name] },
    texts: [],
  }
  const file = client ? `${lower(name)}.client.ts` : null
  const write = async (path: string, text: string, created: boolean) => {
    await writeFile(path, text)
    ;(created ? out.created : out.edited).push(relative(cwd, path))
  }
  const target = join(dir, module)
  if (file && existsSync(join(dir, file)))
    throw new HozuCliError('usage', `${relative(cwd, join(dir, file))} already exists`, [])
  if (!inFeature && existsSync(target))
    throw new HozuCliError('usage', `${relative(cwd, target)} already exists`, [])
  if (existsSync(target))
    await write(target, `${await readFile(target, 'utf8')}\n${declaration(name, file)}`, false)
  else
    await write(
      target,
      `import { ui } from '@hozu/core'\nimport { z } from 'zod'\n\n${declaration(name, file)}`,
      true,
    )
  if (file) await write(join(dir, file), clientModule(name, module), true)
  const edit = async (path: string, change: (s: string) => string | null, manual: string) => {
    const source = existsSync(path) ? await readFile(path, 'utf8') : null
    const next = source === null ? null : change(source)
    if (next === null) out.manual.push(`${relative(cwd, path)}: ${manual}`)
    else if (next !== source) await write(path, next, false)
  }
  if (inFeature) {
    await edit(
      join(dir, 'views.ts'),
      (s) => addImport(s, `import { ${name} } from './components.ts'\n`),
      `import { ${name} } from './components.ts'`,
    )
    await edit(
      join(dir, 'feature.ts'),
      (s) => {
        if (/import \* as components from '\.\/components\.ts'/.test(s)) return s
        const listed = s.replace(
          /declarations: \[([^\]]*)\]/,
          (_, list: string) => `declarations: [${list}, components]`,
        )
        return listed === s ? null : addImport(listed, "import * as components from './components.ts'\n")
      },
      "import * as components from './components.ts' and add components to the feature's declarations list",
    )
  } else {
    const ns = lower(name)
    await edit(
      join(dir, 'kit.ts'),
      (s) => {
        const listed = s.replace(
          /components: \[([^\]]*)\]/,
          (_, list: string) => `components: [${list.trim() ? `${list.trim()}, ` : ''}${ns}]`,
        )
        return listed === s ? null : addImport(listed, `import * as ${ns} from './${module}'\n`)
      },
      `import * as ${ns} from './${module}' and add ${ns} to the kit's components list`,
    )
  }
  if (!client) return out
  await edit(
    join(root, 'app.ts'),
    (s) => {
      if (/components:\s*bundleComponents/.test(s)) return s
      const wired = s.replace(/(app\(\{\n)(\s*)/, '$1$2components: bundleComponents,\n$2')
      return wired === s ? null : addImport(wired, "import { bundleComponents } from '@hozu/bundle'\n")
    },
    "pass components: bundleComponents to app() in app.ts (import { bundleComponents } from '@hozu/bundle')",
  )
  const pkg = join(root, 'package.json')
  await edit(
    pkg,
    (s) => {
      const json = JSON.parse(s) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      const deps = json.dependencies ?? {}
      const dev = json.devDependencies ?? {}
      if (deps['@hozu/bundle'] && !dev['@hozu/bundle']) return s
      if (dev['@hozu/bundle']) {
        delete dev['@hozu/bundle']
        json.devDependencies = dev
      }
      json.dependencies = Object.fromEntries(
        Object.entries({
          ...deps,
          '@hozu/bundle': deps['@hozu/bundle'] ?? bundleSpec(deps['@hozu/core']),
        }).sort(([a], [b]) => a.localeCompare(b)),
      )
      return `${JSON.stringify(json, null, 2)}\n`
    },
    'move @hozu/bundle to dependencies (the server imports it)',
  )
  if (out.edited.includes(relative(cwd, pkg)))
    out.manual.push('run npm install (installs @hozu/bundle as a dependency)')
  return out
}

export function describeAddComponent(out: AddOutput, name: string, client: boolean): string {
  return `${[
    ...out.created.map((f) => `created   ${f}`),
    ...out.edited.map((f) => `edited    ${f}`),
    ...out.manual.map((m) => `todo      ${m}`),
    client
      ? `next      place it in a view: ui.use(${name}, { props: {}, class: 'h-64 w-full' }); declare its props and emits, write the DOM code in the client module (a library's CSS goes in app.css), then hozu check`
      : `next      place it in a view: ui.use(${name}, {}, [...]); declare its props, styles and render, then hozu check`,
  ].join('\n')}\n`
}
