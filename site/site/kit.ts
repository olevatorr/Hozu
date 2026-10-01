import { ui } from '@hozu/core'
import * as footer from './footer.ts'
import * as header from './header.ts'
import * as tag from './tag.ts'

export const kit = ui.kit({ id: 'site', components: [tag, header, footer] })
