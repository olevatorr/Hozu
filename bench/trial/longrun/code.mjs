import { execFileSync } from 'node:child_process'

const CODE = /\.(ts|tsx|mts|js|mjs|vue|css|html)$/
const SKIP = /(^|\/)(node_modules|\.nuxt|\.output|dist|\.claude|\.agents|public)\//

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 })
export const codeFiles = (cwd, ref = 'HEAD') =>
  git(cwd, 'ls-tree', '-r', '--name-only', ref)
    .split('\n')
    .filter((f) => CODE.test(f) && !SKIP.test(f))
export const isCode = (f) => CODE.test(f) && !SKIP.test(f)
export const show = (cwd, ref, f) => git(cwd, 'show', `${ref}:${f}`)
