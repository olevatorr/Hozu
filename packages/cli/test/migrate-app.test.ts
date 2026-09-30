import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sources } from '../src/commands/migrate.ts'
import { BEGIN, END, GUIDE_07, migrateGuide, TARGETS } from '../src/commands/migrate-agent.ts'
import { migrateApp, migratePackage } from '../src/commands/migrate-app.ts'
import { forget } from '../src/commands/migrate-ast.ts'
import { fixture } from './migrate-fixture.ts'

const serve = `import { createServer } from '@hozu/adapter-node'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import { bundleWidgets } from '@hozu/bundle'
import { ogImage } from '@hozu/image'
import { sessionCookie } from '@hozu/runtime-server'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

const port = Number(process.env.PORT ?? 3000)
const user = (cookie: string | undefined) => cookie ?? 'guest'
const build = buildProject(project, { sources: false })

createServer({
  build,
  styles: await compileStyles(build),
  widgets: await bundleWidgets(build),
  og: ogImage,
  resolvers: createResolvers(),
  session: (request) => ({ userId: user(request.headers.get('cookie') ?? undefined) }),
}).listen(port, () => console.log(\`on \${port}\`))
`
const server = `import { resolvers } from '@hozu/data'
import { type Row, listItems } from './model.ts'
import project from './hozu.config.ts'

export function createResolvers() {
  const store: Row[] = []
  return resolvers(project, (implement) => [
    implement(listItems, () => store),
  ])
}
`
const config = `import { project } from '@hozu/core'
export default project({
  routes: {},
  features: [],
})
`
const pkg = `{
  "name": "app",
  "scripts": {
    "start": "node --import @hozu/transform/register serve.ts",
    "dev": "hozu-dev serve.ts"
  },
  "dependencies": {
    "@hozu/core": "^0.7.0",
    "zod": "^4.0.0"
  }
}
`

describe('migrate: serve.ts + createResolvers() → the app module', () => {
  it('writes app.ts, adds project({ app }), keeps session / og / widgets and rewrites other importers', () => {
    const dir = fixture({
      'serve.ts': serve,
      'server.ts': server,
      'hozu.config.ts': config,
      'package.json': pkg,
      'demo.ts': `import { createDataRuntime } from '@hozu/data'\nimport { createResolvers } from './server.ts'\nconst app = 1\nconst data = createDataRuntime({ resolvers: createResolvers() })\n`,
    })
    const r = migrateApp(dir, join(dir, 'hozu.config.ts'), sources(dir))
    expect(r.remove.sort()).toEqual([join(dir, 'serve.ts'), join(dir, 'server.ts')])
    expect(r.write.get(join(dir, 'app.ts'))).toBe(`import { resolvers } from '@hozu/data'
import { type Row, listItems } from './model.ts'
import project from './hozu.config.ts'
import { bundleWidgets } from '@hozu/bundle'
import { ogImage } from '@hozu/image'
import { app } from '@hozu/runtime-server'

const user = (cookie: string | undefined) => cookie ?? 'guest'
const store: Row[] = []

export default app({
  resolvers: resolvers(project, (implement) => [
    implement(listItems, () => store),
  ]),
  widgets: bundleWidgets,
  og: ogImage,
  session: (request) => ({ userId: user(request.headers.get('cookie') ?? undefined) }),
})
`)
    expect(r.write.get(join(dir, 'hozu.config.ts'))).toContain(
      "  app: new URL('./app.ts', import.meta.url),\n})",
    )
    expect(r.write.get(join(dir, 'demo.ts'))).toBe(
      "import { createDataRuntime } from '@hozu/data'\nimport hozuApp from './app.ts'\nimport { appOptionsOf } from '@hozu/runtime-server'\nconst app = 1\nconst data = createDataRuntime({ resolvers: appOptionsOf(hozuApp)!.resolvers })\n",
    )
    const p = migratePackage(pkg, r.entry)
    expect(JSON.parse(p.code).scripts).toEqual({ start: 'hozu serve', dev: 'hozu-dev' })
    expect(JSON.parse(p.code).dependencies['@hozu/runtime-server']).toBe('^0.7.0')
    expect(migratePackage(p.code, null).code).toBe(p.code)
  })

  it('drops sessionCookie with a note and keeps a serve.ts that wraps the server', () => {
    const wrapped = serve
      .replace(
        "session: (request) => ({ userId: user(request.headers.get('cookie') ?? undefined) }),",
        'session: sessionCookie({ name: "sid", secret: "x" }),',
      )
      .replace('}).listen(', '}).on("request", (req, res) => res.setHeader("x", "1")).listen(')
    const dir = fixture({ 'serve.ts': wrapped, 'server.ts': server, 'hozu.config.ts': config })
    forget()
    const r = migrateApp(dir, join(dir, 'hozu.config.ts'), sources(dir))
    expect(r.write.get(join(dir, 'app.ts'))).not.toContain('session')
    expect(r.remove).toEqual([join(dir, 'server.ts')])
    const messages = r.notes.map((n) => n.message)
    expect(messages.some((m) => m.startsWith('sessionCookie(...) dropped'))).toBe(true)
    expect(messages.some((m) => m.startsWith('serve.ts wraps the server'))).toBe(true)
    expect(messages).toContain('serve.ts is kept for you to move by hand; npm start now runs hozu serve')
  })

  it('leaves an app without createResolvers() alone', () => {
    const dir = fixture({ 'hozu.config.ts': config, 'app.ts': 'export default 1\n' })
    const r = migrateApp(dir, join(dir, 'hozu.config.ts'), sources(dir))
    expect([r.write.size, r.remove.length, r.notes.length]).toEqual([0, 0, 0])
  })
})

describe('migrate: the CLAUDE.md / AGENTS.md Hozu block', () => {
  const template = '# __NAME__\n\n0.8 rules for __SKILL__ with `__RUN__ hozu check`\n__NOTE__'
  const claude = TARGETS[0]
  const filled07 = GUIDE_07.replaceAll('__READ__', claude.read)
    .replaceAll('__NAME__', 'app')
    .replaceAll('__RUN__', 'npx')
    .replaceAll('__SKILL__', claude.skill)
    .replaceAll('__NOTE__', '\nThe skill writes commands as `pnpm exec …`; in this app use `npx …`.\n')

  it('replaces a known 0.7 template with the marked block, then keeps it current', () => {
    const first = migrateGuide(filled07, claude, '/x/app', 'pnpm exec', template)
    expect(first.kind).toBe('marked')
    if (first.kind === 'custom') return
    expect(first.code).toBe(
      `${BEGIN}\n# app\n\n0.8 rules for .claude/skills/hozu with \`npx hozu check\`\n${END}\n`,
    )
    expect(migrateGuide(first.code, claude, '/x/app', 'pnpm exec', template).kind).toBe('current')
    const edited = `Notes of my own\n\n${first.code}\nMore notes\n`
    const again = migrateGuide(edited, claude, '/x/app', 'pnpm exec', `${template}\nnew line`)
    expect(again.kind).toBe('replaced')
    if (again.kind !== 'custom') {
      expect(again.code.startsWith('Notes of my own\n\n')).toBe(true)
      expect(again.code.endsWith(`new line\n${END}\n\nMore notes\n`)).toBe(true)
    }
  })

  it('prints the block for a file that is neither a template nor marked', () => {
    const r = migrateGuide('# My app\n\nOwn rules.\n', claude, '/x/app', 'npx', template)
    expect(r.kind).toBe('custom')
    if (r.kind === 'custom') expect(r.block.startsWith(`${BEGIN}\n# My app\n`)).toBe(true)
  })
})
