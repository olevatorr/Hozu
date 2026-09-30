import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [fw, app] = process.argv.slice(2)
const pkg = existsSync(join(app, 'package.json'))
  ? JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  : {}
if (fw === 'nuxt') console.log('.output/server/index.mjs')
else console.log(pkg.scripts?.start?.trim() === 'hozu serve' ? 'hozu serve' : 'serve.ts')
