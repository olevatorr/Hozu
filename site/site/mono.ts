import { ui } from '@hozu/core'
import { z } from 'zod'
import { tv } from './tv.ts'

export const Mono = ui.component({
  tag: 'code',
  styles: tv({ base: 'bg-ink px-1.5 py-0.5 font-mono text-sm text-paper' }),
  props: z.object({}),
  children: true,
  render: ({ children }) => ui.code({}, children),
})
