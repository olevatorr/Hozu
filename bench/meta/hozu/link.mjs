import { mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const packages = ['adapter-node', 'cli', 'core', 'css', 'data', 'runtime-server', 'schema-zod', 'transform']
rmSync(here('node_modules'), { recursive: true, force: true })
mkdirSync(here('node_modules/@hozu'), { recursive: true })
for (const p of packages) symlinkSync(here(`../../../packages/${p}`), here(`node_modules/@hozu/${p}`), 'dir')
symlinkSync(here('../../frameworks/node_modules/zod'), here('node_modules/zod'), 'dir')
