import { readFile } from 'node:fs/promises'
import { connect } from 'fakedb'
import { bus } from 'webpkg'

export const read = async () => `${connect()} ${bus()} ${(await readFile('x').catch(() => '')).length}`
