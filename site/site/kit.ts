import { ui } from '@hozu/core'
import * as codeBlock from './code-block.ts'
import * as footer from './footer.ts'
import * as header from './header.ts'
import * as prose from './prose.ts'
import * as tag from './tag.ts'

export const kit = ui.kit({ id: 'site', components: [tag, header, footer, prose, codeBlock] })
