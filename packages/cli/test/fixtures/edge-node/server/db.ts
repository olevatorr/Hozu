import { readFile } from 'node:fs/promises'
import { connect } from 'fakedb'

export const read = async () => `${connect()} ${(await readFile('x').catch(() => '')).length}`
