import { ui } from '@hozu/core'
import * as badge from './badge.ts'
import * as button from './button.ts'
import * as card from './card.ts'
import * as dialog from './dialog.ts'
import * as field from './field.ts'
import * as icon from './icon.ts'
import * as input from './input.ts'
import * as menu from './menu.ts'
import * as metric from './metric.ts'
import * as nav from './nav.ts'
import * as pageHeader from './page-header.ts'
import * as states from './states.ts'
import * as table from './table.ts'

export const kit = ui.kit({
  id: 'kit',
  components: [button, input, field, badge, card, pageHeader, metric, menu, dialog, states, nav, table, icon],
  styles: new URL('./theme.css', import.meta.url),
})
