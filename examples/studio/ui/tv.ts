import { createTV } from '@hozu/variants'

// hozu:variants-config ui
const twMergeConfig = {
  extend: {
    theme: {
      color: ['brand', 'ink', 'ok', 'paper'],
    },
    classGroups: {},
  },
}
// /hozu:variants-config

export const tv = createTV({ twMergeConfig })
