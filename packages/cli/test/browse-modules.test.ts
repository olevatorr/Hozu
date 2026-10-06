import { describe, expect, it } from 'vitest'
import { exportNames } from '../src/commands/browse-tab.ts'

describe('the fetch module wrapper of hold (ADR 0065 A)', () => {
  it('reads the export names of a bundled module', () => {
    expect(exportNames('var a=1,b=2;export{a as addSymbol,b as myList,c as default};')).toEqual([
      'addSymbol',
      'myList',
    ])
    expect(exportNames('export const saveToken = 1\nexport async function load() {}')).toEqual([
      'saveToken',
      'load',
    ])
  })
})
