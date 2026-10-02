import { ui } from '@hozu/core'
import * as badge from './badge.ts'
import * as button from './button.ts'
import * as field from './field.ts'
import * as input from './input.ts'

export const kit = ui.kit({ id: 'ui', components: [button, input, field, badge] })
