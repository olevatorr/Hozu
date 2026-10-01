import { ui } from '@hozu/core'
import * as button from './button.ts'
import * as catchCard from './catch-card.ts'
import * as codeBlock from './code-block.ts'
import * as display from './display.ts'
import * as footer from './footer.ts'
import * as header from './header.ts'
import * as joint from './joint.ts'
import * as mono from './mono.ts'
import * as prose from './prose.ts'
import * as receipt from './receipt.ts'
import * as section from './section.ts'
import * as statTable from './stat-table.ts'
import * as steps from './steps.ts'
import * as tag from './tag.ts'
import * as ticker from './ticker.ts'

export const kit = ui.kit({
  id: 'site',
  components: [
    tag,
    header,
    footer,
    prose,
    codeBlock,
    section,
    display,
    button,
    receipt,
    catchCard,
    ticker,
    steps,
    statTable,
    mono,
    joint,
  ],
})
