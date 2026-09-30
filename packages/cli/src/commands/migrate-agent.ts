import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { TARGETS } from 'create-hozu'

export type { BlockResult } from 'create-hozu'
export { BEGIN, currentGuide, END, GUIDE_07, migrateGuide, TARGETS } from 'create-hozu'

export const skillTargets = (dir: string) => TARGETS.filter((t) => existsSync(join(dir, t.skill)))
