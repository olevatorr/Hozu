import { ui } from '@hozu/core'
import { z } from 'zod'

export const CodeCopy = ui.widget({
  tag: 'div',
  props: z.object({}),
  events: {},
  client: new URL('./codeCopy.client.ts', import.meta.url),
  load: 'visible',
  wraps: true,
})
