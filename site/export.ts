import { copyFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { exportStatic } from '@hozu/adapter-static'
import { buildProject } from '@hozu/core/ir'
import { compileStyles } from '@hozu/css'
import project from './hozu.config.ts'
import { createResolvers } from './server.ts'

const build = buildProject(project, { sources: false })
const outDir = fileURLToPath(new URL('./dist/', import.meta.url))
await rm(outDir, { recursive: true, force: true })
const result = await exportStatic({
  build,
  styles: await compileStyles(build),
  resolvers: createResolvers(),
  outDir,
})
for (const file of result.written) console.log(`wrote   ${file}`)
for (const { route, reason } of result.skipped) console.error(`skipped ${route}: ${reason}`)
if (result.skipped.length) process.exitCode = 1
else {
  await copyFile(
    new URL('./assets/icon-256.png', import.meta.url),
    new URL('./dist/icon-256.png', import.meta.url),
  )
  await writeFile(
    new URL('./dist/manifest.webmanifest', import.meta.url),
    JSON.stringify({
      name: 'Hozu',
      short_name: 'Hozu',
      lang: 'en',
      start_url: '/',
      display: 'browser',
      theme_color: '#245ca6',
      background_color: '#ffffff',
      icons: [{ src: '/icon-256.png', sizes: '256x256', type: 'image/png' }],
    }),
  )
  await writeFile(new URL('./dist/CNAME', import.meta.url), 'hozu.org\n')
  await writeFile(new URL('./dist/.nojekyll', import.meta.url), '')
  console.log(`Exported ${result.written.length} files; 0 skipped routes. Wrote CNAME and .nojekyll.`)
}
