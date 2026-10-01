import { ui } from '@hozu/core'
import { z } from 'zod'

export const CodeBlock = ui.component({
  tag: 'div',
  props: z.object({}),
  client: new URL('./code-block.client.ts', import.meta.url),
  load: 'visible',
  children: true,
  render: ({ children }) => ui.div({}, children),
})
