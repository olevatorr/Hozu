import { createTV } from '@hozu/variants'

// hozu:variants-config ui
const twMergeConfig = {
  extend: {
    theme: {},
    classGroups: {},
  },
}
// /hozu:variants-config

export const tv = createTV({ twMergeConfig })
