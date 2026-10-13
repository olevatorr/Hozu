import { createTV } from '@hozu/variants'

// hozu:variants-config ui
const twMergeConfig = {
  extend: {
    theme: {
      color: [
        'accent',
        'accent-subtle',
        'accent-text',
        'canvas',
        'danger',
        'danger-subtle',
        'danger-text',
        'down',
        'focus',
        'info-subtle',
        'info-text',
        'ink',
        'ink-faint',
        'ink-muted',
        'line',
        'line-strong',
        'on-accent',
        'on-danger',
        'scrim',
        'success-subtle',
        'success-text',
        'surface',
        'surface-raised',
        'surface-sunken',
        'up',
        'warning-subtle',
        'warning-text',
      ],
      font: ['display'],
      radius: ['card', 'control', 'pill'],
      shadow: ['control', 'overlay'],
      text: ['display', 'metric'],
    },
    classGroups: {
      display: ['display'],
      skeleton: ['skeleton'],
    },
  },
}
// /hozu:variants-config

export const tv = createTV({ twMergeConfig })
